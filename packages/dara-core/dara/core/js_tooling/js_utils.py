"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import json
import os
import pathlib
import shutil
import sys
from enum import Enum
from importlib.metadata import version
from typing import Any, Dict, List, Optional, Union, cast

from packaging.version import Version
from pydantic import BaseModel
from typing_extensions import TypedDict

from dara.core.configuration import Configuration
from dara.core.definitions import JsComponentDef
from dara.core.internal.settings import get_settings
from dara.core.logging import dev_logger


class BuildMode(Enum):
    # AutoJS mode - use pre-bundled UMDs
    AUTO_JS = 'AUTO_JS'
    # Production mode - vite build from generated entry file (optionally with custom JS)
    PRODUCTION = 'PRODUCTION'


class JsConfig(TypedDict):
    # Relative path to the local entrypoint from the package root
    local_entry: str
    # Extra dependencies to add to package.json before running install
    extra_dependencies: Dict[str, str]
    # Package manager to use, defaults to npm
    package_manager: str


class BuildConfig(BaseModel):
    # Build mode set based on CLI settings
    mode: BuildMode
    # Whether HMR is enabled
    dev: bool
    # Custom JS configuration from config file
    js_config: Optional[JsConfig] = None
    # Optional npm registry url to pull packages from
    npm_registry: Optional[str] = None
    # Optional npm token for the registry url added above
    npm_token: Optional[str] = None


def get_js_config() -> Union[JsConfig, None]:
    """
    Get the JS configuration from dara.config.json.
    """
    js_config_path = os.path.join(os.getcwd(), 'dara.config.json')

    if not os.path.exists(js_config_path):
        return None

    with open(js_config_path, 'r', encoding='utf-8') as f:
        js_config = json.loads(f.read())

    # Validate the config
    if 'package_manager' in js_config:
        if js_config['package_manager'] not in ['npm', 'yarn', 'pnpm']:
            raise ValueError('Invalid "package_manager" in "dara.config.json", must be one of "pnpm", "npm" or "yarn"')

    return js_config


def setup_js_scaffolding():
    """
    Create a dara custom js config
    """
    jsconfig_template_path = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/dara.config.json')
    js_config_path = os.path.join(os.getcwd(), 'dara.config.json')

    shutil.copyfile(jsconfig_template_path, js_config_path)

    js_scaffold_path = os.path.join(pathlib.Path(__file__).parent.absolute(), 'custom_js_scaffold')
    shutil.copytree(js_scaffold_path, os.path.join(os.getcwd(), 'js'))


def get_build_config() -> BuildConfig:
    """
    Get build configuration
    """
    js_config = get_js_config()

    # Production mode - if --enable-hmr or --production or --docker is set
    is_production = os.environ.get('DARA_PRODUCTION_MODE', 'FALSE') == 'TRUE'
    is_hmr = os.environ.get('DARA_HMR_MODE', 'FALSE') == 'TRUE'
    is_docker = os.environ.get('DARA_DOCKER_MODE', 'FALSE') == 'TRUE'
    if is_hmr or is_production or is_docker:
        return BuildConfig(mode=BuildMode.PRODUCTION, dev=is_hmr, js_config=js_config)

    return BuildConfig(mode=BuildMode.AUTO_JS, dev=False)


def _serialise_build_config(build_config: BuildConfig) -> str:
    """
    Helper method to serialise the build_config into a unique string
    Used as a key in the build cache file

    :param build_config: build configuration
    """
    serialised: str = build_config.mode.value

    if build_config.dev:
        serialised += '_DEV'

    return serialised


def _py_version_to_js(package_name: str) -> str:
    """
    Parse a python version string into a JS compatible version string

    :param package_name: the name of the package
    """
    raw_version = version(package_name)
    parsed_version = Version(raw_version)

    if parsed_version.is_postrelease:
        raise ValueError(f'Post releases are not supported, found version {raw_version} for package {package_name}')

    # Handle pre releases (a|b|c|rc|alpha|beta|pre|preview)
    if parsed_version.is_prerelease and parsed_version.pre is not None:
        pre_name, pre_version = parsed_version.pre
        return f'{parsed_version.base_version}-{pre_name}.{pre_version}'

    # Handle dev releases (dev)
    if parsed_version.is_devrelease and parsed_version.dev is not None:
        return f'{parsed_version.base_version}-dev.{parsed_version.dev}'

    return raw_version


def _get_required_js_packages(config: Configuration) -> Dict[str, str]:
    """
    Based on current Configuration, get a map of required JS packages.
    Creates a dict of {'py_module_name': 'js_module_name'}
    """
    packages = {
        'dara.core': '@darajs/core',
    }

    # Discover py modules with js modules to pull in
    for comp_def in config.components:
        if isinstance(comp_def, JsComponentDef) and comp_def.js_module is not None:
            packages[comp_def.py_module] = comp_def.js_module

    for act_def in config.actions:
        if act_def.js_module is not None:
            packages[act_def.py_module] = act_def.js_module

    # Handle auth components
    for comp in config.auth_config.component_config.dict().values():
        packages[comp['py_module']] = comp['js_module']

    return packages


def _get_importers(config: Configuration, build_config: Optional[BuildConfig] = None) -> Dict[str, str]:
    """
    Get the set of importers to generate, handling local JS modules.

    Creates a dict of {'py_module_name': 'js_module_name'}

    :param configuration: the app configuration
    :param build_config: build configuration
    """
    importers_dict = _get_required_js_packages(config)

    # Include an entry for the local module
    if build_config and build_config.js_config:
        # Absolute path to the local entry directory
        absolute_path = os.path.abspath(os.path.join(os.getcwd(), build_config.js_config['local_entry']))

        ## The below blocks setup symlinks to and from the custom js folder so that code there is picked up by the
        ## build system and also picks up the node modules folder for a much improved dev experience

        # Create a symlink from the custom js folder into the static files directory
        new_path = os.path.abspath(os.path.join(config.static_files_dir, build_config.js_config['local_entry']))
        try:
            os.unlink(new_path)
        except FileNotFoundError:
            pass
        os.symlink(absolute_path, new_path)

        # Create a symlink for the node modules in the custom_js folder
        node_modules_path = os.path.abspath(os.path.join(config.static_files_dir, 'node_modules'))
        new_node_modules_path = os.path.abspath(
            os.path.join(os.getcwd(), build_config.js_config['local_entry'], 'node_modules')
        )
        try:
            os.unlink(new_node_modules_path)
        except FileNotFoundError:
            pass
        os.symlink(node_modules_path, new_node_modules_path)

        # Add the copied directory to the importers dict
        importers_dict['LOCAL'] = './' + os.path.relpath(new_path, config.static_files_dir)

    return importers_dict


def _generate_package_json(config: Configuration, build_config: BuildConfig) -> Dict[str, Any]:
    """
    Generate a package.json file for installing dependencies

    :param configuration: the app configuration
    :param build_config: build configuration
    """
    project_name = os.path.basename(os.getcwd())
    pkg_json = {
        'name': project_name,
        'private': True,
        'version': '0.0.1',
        'main': 'dist/index.js',
        'scripts': {'dev': 'vite', 'build': 'vite build'},
        'overrides': {'react': '^18.2.0', 'react-dom': '^18.2.0'},
    }

    deps = {
        '@darajs/core': _py_version_to_js('dara.core'),
    }

    # Entry for custom jS
    if config.js_module_name is not None and os.path.exists(config.js_module_name[1]) is False:
        deps[config.js_module_name[1]] = config.js_module_name[2]

    required_packages = _get_required_js_packages(config)

    for py_module, js_module in required_packages.items():
        if js_module not in deps:
            deps[js_module] = _py_version_to_js(py_module)

    # Append extra dependencies from JS config if present
    if build_config.js_config:
        for k, v in build_config.js_config['extra_dependencies'].items():
            deps[k] = v

    # Required for building/dev mode; append into deps
    pkg_json['dependencies'] = {
        **deps,
        '@vitejs/plugin-react': '2.1.0',
        'vite': '3.1.8',
    }
    return pkg_json


def _copy_statics(destination: str):
    """
    Copy static assets from 'static' folder to the given destination directory
    Returns path to favicon source if found in the static directory.
    """
    favicon_source = None

    if os.path.isdir('static'):
        staticFiles = os.listdir('static')
        for fname in staticFiles:
            if fname.endswith('.ico'):
                favicon_source = os.path.join('static', fname)
            elif os.path.isdir(os.path.join('static', fname)):
                shutil.copytree(os.path.join('static', fname), os.path.join(destination, fname), dirs_exist_ok=True)
            else:
                shutil.copyfile(os.path.join('static', fname), os.path.join(destination, fname))

    return favicon_source


def require_js_build(config: Configuration, build_config: BuildConfig) -> bool:
    """
    Check if we need to build any JS as part of the startup. e.g. If it's a first load or if a new extension has been
    loaded. Returns True if a new build is required.

    :param config: the main app configuration
    :param build_config: the build configuration
    """
    # In docker mode force no build
    if os.environ.get('DARA_DOCKER_MODE', 'FALSE') == 'TRUE':
        dev_logger.debug('Docker mode')
        return False

    # Explitily forced to rebuild
    if os.environ.get('DARA_JS_REBUILD', 'FALSE') == 'TRUE':
        dev_logger.debug('JS rebuild forced explicitly')
        return True

    # Check if build cache exists
    build_cache_path = os.path.join(config.static_files_dir, '_build.json')
    if not os.path.exists(build_cache_path):
        dev_logger.debug('No build cache found')
        return True

    # Compare build cache for current build mode with new importers
    with open(build_cache_path, 'r', encoding='utf-8') as f:
        build_cache = json.loads(f.read())

    new_importers = _get_importers(config, build_config)
    old_importers = build_cache.get(_serialise_build_config(build_config), None)
    importers_changed = new_importers != old_importers

    if importers_changed:
        dev_logger.debug(
            f'Extensions loaded changed from {list(old_importers.keys()) if old_importers is not None else []} to {list(new_importers.keys())}'
        )

    return importers_changed


def rebuild_js(config: Configuration, build_config: BuildConfig):
    """
    Generic 'rebuild' function which bundles/prepares assets depending on the build mode chosen

    :param config: the main app configuration
    :param build_config: the build configuration
    """

    # Create static dir if it does not exist
    if not os.path.isdir(config.static_files_dir):
        os.mkdir(config.static_files_dir)

    importers_dict = None

    # Load build cache - or create empty if not yet created
    build_cache_path = os.path.join(config.static_files_dir, '_build.json')
    if not os.path.exists(build_cache_path):
        build_cache = {}
    else:
        with open(build_cache_path, 'r', encoding='utf-8') as f:
            build_cache = json.load(f)

    if build_config.mode == BuildMode.AUTO_JS:
        # In autoJS mode, just prepare pre-built assets to be included directly
        importers_dict = prepare_autojs_assets(config)
    else:
        # In production mode, build using Vite production build
        importers_dict = bundle_js(config=config, build_config=build_config)

    # Update and store build cache
    build_cache[_serialise_build_config(build_config)] = importers_dict
    with open(build_cache_path, 'w+', encoding='utf-8') as f:
        json.dump(build_cache, f, indent=4)


def bundle_js(config: Configuration, build_config: BuildConfig, output_dir: Optional[str] = None) -> dict:
    """
    Bundle the JS (and CSS) in production mode using Vite

    :param config: the main app configuration
    :param build_config: build configuration
    :param output_dir: optional override to the output directory
    """
    # Determine template paths
    entry_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/_entry.template.tsx')
    vite_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/vite.config.template.ts')
    npmrc_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/.npmrc')
    statics = os.path.join(pathlib.Path(__file__).parent.absolute(), 'statics')

    # Ensure the static files directory exists
    os.makedirs(config.static_files_dir, exist_ok=True)

    # Generate importers dict for extensions and main configuration.
    importers_dict = _get_importers(config, build_config)

    # Generate a package json
    package_json = _generate_package_json(config, build_config)
    with open(os.path.join(config.static_files_dir, 'package.json'), 'w+', encoding='utf-8') as f:
        f.write(json.dumps(package_json))

    # Copy .npmrc
    npmrc_location = os.path.join(config.static_files_dir, '.npmrc')
    shutil.copyfile(npmrc_template, npmrc_location)

    # If we need to pull from a custom registry in CI where the user is not npm logged in, then add to the npmrc file
    if build_config.npm_token is not None and build_config.npm_registry is not None:
        with open(npmrc_location, 'a', encoding='utf-8') as npmrc_file:
            npmrc_file.write(
                f'//{build_config.npm_registry}/:_authToken={build_config.npm_token}'
            )

    # Copy statics
    files = os.listdir(statics)
    for fname in files:
        shutil.copyfile(os.path.join(statics, fname), os.path.join(config.static_files_dir, fname))

    # Copy favicon from statics folder if provided or default if not
    served_statics = output_dir if output_dir else config.static_files_dir
    favicon_source = os.path.join(statics, 'favicon.ico')

    new_favicon_source = _copy_statics(served_statics)
    if new_favicon_source:
        favicon_source = new_favicon_source

    shutil.copyfile(favicon_source, os.path.join(served_statics, 'favicon.ico'))

    # Run JS install
    package_manager = 'npm'

    if build_config.js_config and 'package_manager' in build_config.js_config:
        package_manager = build_config.js_config['package_manager']

    cwd = os.getcwd()
    os.chdir(config.static_files_dir)
    exit_code = os.system(f'{package_manager} install')   # nosec B605 # package_manager is validated
    if exit_code > 0:
        raise SystemError(
            "Failed to install the JS dependencies - there's likely a connection issue or a broken package"
        )

    # Load entry template as a string
    with open(entry_template, 'r', encoding='utf-8') as f:
        entry_template_str = f.read()
    with open(vite_template, 'r', encoding='utf-8') as f:
        vite_template_str = f.read()

    # Convert importers dict to a string for injection into the template
    importers_out = '{'
    for name, package in importers_dict.items():
        importers_out += f'"{name}": () => import("{package}"),'
    importers_out = f'{importers_out[:-1]}}}'

    #  Write the entry file back out
    with open('_entry.tsx', 'w+', encoding='utf-8') as f:
        f.write(entry_template_str.replace('$$importers$$', importers_out))

    with open('vite.config.ts', 'w+', encoding='utf-8') as f:
        f.write(vite_template_str.replace('$$output$$', './' if output_dir is None else output_dir))

    # In dev mode don't build the app, tell the user to run DEV alongside this process
    if build_config.dev:
        dev_logger.warning('App is in DEV mode, running `dara dev` CLI command alongside this process is required')
    else:
        # Run build pointed at the generated entry file
        exit_code = os.system(f'{package_manager} run build')   # nosec B605 # package_manager is validated
        if exit_code > 0:
            raise SystemError('Failed to build the JS part of the project')

    # Return process to it's original working dir
    os.chdir(cwd)
    return importers_dict


def prepare_autojs_assets(config: Configuration) -> dict:
    """
    Prepare the JS (and CSS) assets to use in autoJS mode.
    Copies over UMD pre-bundled files from loaded extensions into static directory,
    ready to be served directly without bundling.

    :param config: the main app configuration
    """
    # copy over dara.core js/css into static dir
    core_path = os.path.dirname(cast(str, sys.modules['dara.core'].__file__))
    core_js_path = os.path.join(core_path, 'umd', 'dara.core.umd.js')
    core_css_path = os.path.join(core_path, 'umd', 'style.css')
    favicon_source = os.path.join(core_path, 'js_tooling', 'statics', 'favicon.ico')

    new_favicon_source = _copy_statics(config.static_files_dir)
    if new_favicon_source:
        favicon_source = new_favicon_source

    shutil.copy(core_js_path, os.path.join(config.static_files_dir, 'dara.core.umd.js'))
    shutil.copy(core_css_path, os.path.join(config.static_files_dir, 'dara.core.css'))
    shutil.copy(favicon_source, os.path.join(config.static_files_dir, 'favicon.ico'))

    py_modules = set()

    required_packages = _get_required_js_packages(config)

    for py_module in required_packages.keys():
        py_modules.add(py_module)

    # If we ended up with dara.core registered, remove it as it has already been moved
    if 'dara.core' in py_modules:
        py_modules.remove('dara.core')

    # Copy over js/css for all modules
    for module_name in py_modules:
        # Get path to the module
        module_path = os.path.dirname(cast(str, sys.modules[module_name].__file__))

        # Build paths to the JS and CSS assets for the given module
        # Note: this assumes assets structure of module/umd folder with the module.umd.js and style.css file
        js_asset_path = os.path.join(module_path, 'umd', f'{module_name}.umd.js')
        css_asset_path = os.path.join(module_path, 'umd', 'style.css')

        # copy over the JSS/CSS from python package into dist/umd so they are available under /static
        if os.path.exists(js_asset_path):
            shutil.copy(js_asset_path, os.path.join(config.static_files_dir, f'{module_name}.umd.js'))

        if os.path.exists(css_asset_path):
            shutil.copy(css_asset_path, os.path.join(config.static_files_dir, f'{module_name}.css'))

    # Generate importers dict for extensions and main configuration.
    importers_dict = _get_importers(config)

    return importers_dict


def build_autojs_template(html_template: str, config: Configuration) -> str:
    """
    Build the autojs html template by replacing $$assets$$ with required tags based on extensions loaded
    and including the startup script

    :param html_template: html template to fill out
    :param config: app configuration
    """
    settings = get_settings()
    entry_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/_entry_autojs.template.tsx')
    with open(entry_template, 'r', encoding='utf-8') as f:
        entry_template_str = f.read()

    # Read the cached importers dict from build cache
    with open(os.path.join(config.static_files_dir, '_build.json'), 'r', encoding='utf-8') as f:
        importers_dict = json.load(f)[BuildMode.AUTO_JS.value]

    # Convert importers dict to a string for injection into the template
    importers_out = '{'
    for name, _ in importers_dict.items():
        importers_out += f'"{name}": () => Promise.resolve({name}),'
    importers_out = f'{importers_out[:-1]}}}'
    start_script = (
        entry_template_str.replace('$$importers$$', importers_out)
        .replace('$$baseUrl$$', settings.dara_base_url)
        .replace('$$extraJs$$', config.template_extra_js + '\n' + settings.dara_template_extra_js)
    )

    package_tags: Dict[str, List[str]] = {
        'dara.core': [
            f'<script crossorigin src="{settings.dara_base_url}/static/dara.core.umd.js"></script>',
            f'<link rel="stylesheet" href="{settings.dara_base_url}/static/dara.core.css"></link>',
        ]
    }

    py_modules = set()

    required_packages = _get_required_js_packages(config)

    for py_module in required_packages.keys():
        py_modules.add(py_module)

    # If we ended up with dara.core registered, remove it as it would be included twice then
    if 'dara.core' in py_modules:
        py_modules.remove('dara.core')

    for module_name in py_modules:
        module_tags = []

        # Include tag for JS if file exists
        if os.path.exists(os.path.join(config.static_files_dir, f'{module_name}.umd.js')):
            js_tag = f'<script crossorigin src="{settings.dara_base_url}/static/{module_name}.umd.js"></script>'
            module_tags.append(js_tag)

        # Include tag for CSS if file exists
        if os.path.exists(os.path.join(config.static_files_dir, f'{module_name}.css')):
            css_tag = f'<link rel="stylesheet" href="{settings.dara_base_url}/static/{module_name}.css"></link>'
            module_tags.append(css_tag)

        package_tags[module_name] = module_tags

    # preprocess the tags
    for processor in config.package_tag_processors:
        package_tags = processor(package_tags)

    # Flatten the package tags into a single list
    tags = [tag for tags in package_tags.values() for tag in tags]

    tags.append(f'<script type="module">{start_script}</script>')
    # Include tag for favicon
    tags.append(
        f'<link id="favicon" rel="icon" type="image/x-icon" href="{settings.dara_base_url}/static/favicon.ico"></link>'
    )

    return html_template.replace('$$assets$$', '\n'.join(tags))
