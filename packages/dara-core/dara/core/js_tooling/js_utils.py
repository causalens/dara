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

import contextlib
import importlib
import json
import os
import pathlib
import shutil
import sys
from enum import Enum
from importlib.metadata import version
from typing import Any, ClassVar, Dict, List, Literal, Optional, Set, Union, cast

from packaging.version import Version
from pydantic import BaseModel

from dara.core.configuration import Configuration
from dara.core.internal.settings import get_settings
from dara.core.logging import dev_logger


class BuildMode(Enum):
    AUTO_JS = 'AUTO_JS'
    """AutoJS mode - use pre-bundled UMDs"""

    PRODUCTION = 'PRODUCTION'
    """Production mode - vite build from generated entry file (optionally with custom JS)"""


class JsConfig(BaseModel):
    # Relative path to the local entrypoint from the package root
    local_entry: str
    """Relative path to the local entrypoint from the package root"""

    extra_dependencies: Dict[str, str]
    """Extra dependencies to add to package.json before running install"""

    package_manager: Literal['npm', 'yarn', 'pnpm']
    """Package manager to use, defaults to npm"""

    @staticmethod
    def from_file(path: str = 'dara.config.json') -> Optional['JsConfig']:
        """
        Read from a config file

        :param path: path to the config file, defaults to 'dara.config.json'
        """
        if not os.path.exists(path):
            return None

        return JsConfig.parse_file(path)


class BuildConfig(BaseModel):
    """
    Represents the build configuration used
    """

    mode: BuildMode
    """Build mode set based on CLI settings"""

    dev: bool
    """Whether dev (HMR) mode is enabled"""

    js_config: Optional[JsConfig] = None
    """Custom JS configuration from dara.config.json file"""

    npm_registry: Optional[str] = None
    """Optional npm registry url to pull packages from"""

    npm_token: Optional[str] = None
    """Optional npm token for the registry url added above"""

    @staticmethod
    def from_env():
        # Production mode - if --enable-hmr or --production or --docker is set
        is_production = os.environ.get('DARA_PRODUCTION_MODE', 'FALSE') == 'TRUE'
        is_hmr = os.environ.get('DARA_HMR_MODE', 'FALSE') == 'TRUE'
        is_docker = os.environ.get('DARA_DOCKER_MODE', 'FALSE') == 'TRUE'

        if is_hmr or is_production or is_docker:
            js_config = JsConfig.from_file()
            return BuildConfig(mode=BuildMode.PRODUCTION, dev=is_hmr, js_config=js_config)

        return BuildConfig(mode=BuildMode.AUTO_JS, dev=False)


BuildCacheKey = Literal['static_folders', 'static_files_dir', 'package_map', 'build_config']


class BuildCacheDiff(BaseModel):
    """
    Represents the diff between two BuildCaches.
    Contains a list of keys that have changed.
    """

    keys: Set[BuildCacheKey]

    def should_rebuild_js(self) -> bool:
        """
        Returns True if a JS rebuild is required.
        This is the case if:
        - static_files_dir changed - the output folder is different, we need to install into a different output folder
        - package_map changed - required packages changed, we need to install new packages
        - build_config changed - build config changed, we need to install with a different config
        """
        full_rebuild_keys: Set[BuildCacheKey] = set(['static_files_dir', 'package_map', 'build_config'])

        return len(full_rebuild_keys.intersection(self.keys)) > 0

    @staticmethod
    def full_diff() -> 'BuildCacheDiff':
        """
        Return a full diff - as if everything changed
        """
        return BuildCacheDiff(keys=set(['static_folders', 'static_files_dir', 'package_map', 'build_config']))


class BuildCache(BaseModel):
    """
    Represents the build configuration cache. Contains complete information required to determine
    how to handle the frontend assets and statics.
    """

    static_folders: List[str]
    """List of static folders registered"""

    static_files_dir: str
    """Static files output folder"""

    package_map: Dict[str, str]
    """Map of py_module_name to js_module_name"""

    build_config: BuildConfig
    """Build configuration used to generate this cache"""

    FILENAME: ClassVar[str] = '_build.json'

    @staticmethod
    def from_config(config: Configuration, build_config: Optional[BuildConfig] = None):
        """
        Create a BuildCache from a Configuration

        :param config: Configuration to use
        :param build_config: BuildConfig to use, defaults to BuildConfig.from_env()
        """
        if build_config is None:
            build_config = BuildConfig.from_env()

        static_folders = config.static_folders

        # Add default static folder if not already present, it is implicitly always used if present
        if 'static' not in static_folders and os.path.isdir('static'):
            static_folders.insert(0, 'static')

        return BuildCache(
            static_folders=static_folders,
            static_files_dir=config.static_files_dir,
            package_map=config.get_package_map(),
            build_config=build_config,
        )

    def migrate_static_assets(self):
        """
        Migrate data from registered static folders into the static_files_dir.
        """
        # Make sure the static files dir exists
        os.makedirs(self.static_files_dir, exist_ok=True)

        # For each static folder registered
        for static_folder in self.static_folders:
            if not os.path.isdir(static_folder):
                dev_logger.warning(f'Provided static folder {static_folder} does not exist')
                continue

            names = os.listdir(static_folder)

            # For each file or directory in the static folder provided
            for name in names:
                file_or_dir_path = os.path.join(static_folder, name)
                target_path = os.path.join(self.static_files_dir, name)

                # Copy the whole tree if it's a directory
                if os.path.isdir(file_or_dir_path):
                    _copytree(file_or_dir_path, target_path)
                else:
                    # Otherwise copy file if doesn't already exist
                    shutil.copy2(file_or_dir_path, self.static_files_dir)

    def find_favicon(self) -> Optional[str]:
        """
        Find the favicon in the static files directories, looks for any .ico file

        :return: path to favicon if found, None otherwise
        """
        for static_folder in self.static_folders:
            if not os.path.isdir(static_folder):
                dev_logger.warning(f'Provided static folder {static_folder} does not exist')
                continue

            for name in os.listdir(static_folder):
                if name.endswith('.ico'):
                    return os.path.join(static_folder, name)

        return None

    def symlink_js(self):
        """
        Symlink:
        - the custom js source folder into the static files directory
        - the node_modules folder into the custom js source folder
        """

        if self.build_config.js_config is None:
            return

        # Absolute path to the local entry directory
        absolute_path = os.path.abspath(os.path.join(os.getcwd(), self.build_config.js_config.local_entry))

        ## The below blocks setup symlinks to and from the custom js folder so that code there is picked up by the
        ## build system and also picks up the node modules folder for a much improved dev experience

        # Create a symlink from the custom js folder into the static files directory
        new_path = os.path.abspath(os.path.join(self.static_files_dir, self.build_config.js_config.local_entry))
        with contextlib.suppress(FileNotFoundError):
            os.unlink(new_path)
        os.symlink(absolute_path, new_path)

        # Create a symlink for the node modules in the custom_js folder
        node_modules_path = os.path.abspath(os.path.join(self.static_files_dir, 'node_modules'))
        new_node_modules_path = os.path.abspath(
            os.path.join(os.getcwd(), self.build_config.js_config.local_entry, 'node_modules')
        )
        with contextlib.suppress(FileNotFoundError):
            os.unlink(new_node_modules_path)
        os.symlink(node_modules_path, new_node_modules_path)

    def get_importers(self) -> Dict[str, str]:
        """
        Get the importers map for this BuildCache.
        Includes `self.package_map` and a local entry if it exists.
        """
        importers = self.package_map.copy()

        # add local entry if exists
        if self.build_config.js_config:
            # Symlinked path to the local entry
            new_path = os.path.abspath(os.path.join(self.static_files_dir, self.build_config.js_config.local_entry))
            importers['LOCAL'] = './' + os.path.relpath(new_path, self.static_files_dir)

        return importers

    def get_py_modules(self) -> List[str]:
        """
        Get a list of all py modules used in this BuildCache
        """
        py_modules = set()

        for module in self.package_map:
            py_modules.add(module)

        if 'dara.core' in py_modules:
            py_modules.remove('dara.core')

        return list(py_modules)

    def get_package_json(self) -> Dict[str, Any]:
        """
        Generate a package.json file for this BuildCache
        """

        project_name = os.path.basename(os.getcwd())

        pkg_json = {
            'name': project_name,
            'private': True,
            'version': '0.0.1',
            'main': 'dist/index.js',
            # --base needs to be set here due to the changes in how static urls are resolved
            'scripts': {'dev': 'vite --base=http://localhost:3000/static/', 'build': 'vite build'},
            'overrides': {'react': '^18.2.0', 'react-dom': '^18.2.0'},
        }

        deps = {
            '@darajs/core': _py_version_to_js('dara.core'),
        }

        # Add all dependencies from package_map, parsing python versions to JS versions
        for py_module, js_module in self.package_map.items():
            if js_module not in deps:
                deps[js_module] = _py_version_to_js(py_module)

        # Append extra dependencies from JS config if present
        if self.build_config.js_config:
            for k, v in self.build_config.js_config.extra_dependencies.items():
                deps[k] = v

        # Append core deps required for building/dev mode
        pkg_json['dependencies'] = {
            **deps,
            '@vitejs/plugin-react': '4.6.0',
            'vite': '7.0.4',
            'vite-plugin-node-polyfills': '0.24.0',
        }

        return pkg_json

    def get_diff(self, other: Optional[Union['BuildCache', str]] = None) -> BuildCacheDiff:
        """
        Get the diff between this BuildCache and another.
        Returns a list of keys that have changed.

        :param other: the other BuildCache to diff against, or a path to a BuildCache; if none provided,
            parses diff from file in configured static_files_dir
        """
        # If other is a path, parse a build cache from file
        if isinstance(other, str) or other is None:
            path = other or os.path.join(self.static_files_dir, BuildCache.FILENAME)

            try:
                other_cache = BuildCache.parse_file(path)
            except BaseException:
                return BuildCacheDiff.full_diff()
        else:
            other_cache = other

        diff: Set[BuildCacheKey] = set()

        if set(self.static_folders) != set(other_cache.static_folders):
            diff.add('static_folders')

        if self.static_files_dir != other_cache.static_files_dir:
            diff.add('static_files_dir')

        if self.package_map != other_cache.package_map:
            diff.add('package_map')

        if self.build_config != other_cache.build_config:
            diff.add('build_config')

        return BuildCacheDiff(keys=diff)


def setup_js_scaffolding():
    """
    Create a dara custom js config
    """
    jsconfig_template_path = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/dara.config.json')
    js_config_path = os.path.join(os.getcwd(), 'dara.config.json')

    shutil.copyfile(jsconfig_template_path, js_config_path)

    js_scaffold_path = os.path.join(pathlib.Path(__file__).parent.absolute(), 'custom_js_scaffold')
    shutil.copytree(js_scaffold_path, os.path.join(os.getcwd(), 'js'))


def _copytree(src: str, dst: str):
    """
    Copy a directory recursively.
    Works like shutil.copytree, except replaces files if they already exist.
    """

    for root, _, files in os.walk(src):
        for curr_file in files:
            from_file = os.path.join(root, curr_file)
            to_file = os.path.join(dst, os.path.relpath(from_file, src))
            os.makedirs(os.path.dirname(to_file), exist_ok=True)
            shutil.copy2(from_file, to_file)


def _py_version_to_js(package_name: str) -> str:
    """
    Parse a python version string into a JS compatible version string

    :param package_name: the name of the package
    """
    # For dara.* packages, replace . with -
    if package_name.startswith('dara.'):
        package_name = package_name.replace('.', '-')

    raw_version = version(package_name)
    parsed_version = Version(raw_version)

    if parsed_version.is_postrelease:
        raise ValueError(f'Post releases are not supported, found version {raw_version} for package {package_name}')

    # Handle pre releases (a|b|c|rc|alpha|beta|pre|preview)
    if parsed_version.is_prerelease and parsed_version.pre is not None:
        pre_name, pre_version = parsed_version.pre

        # js names created are full alpha/beta
        if pre_name == 'a':
            pre_name = 'alpha'
        elif pre_name == 'b':
            pre_name = 'beta'

        return f'{parsed_version.base_version}-{pre_name}.{pre_version}'

    # Handle dev releases (dev)
    if parsed_version.is_devrelease and parsed_version.dev is not None:
        return f'{parsed_version.base_version}-dev.{parsed_version.dev}'

    return raw_version


def _get_module_file(module: str) -> str:
    """
    Get the file containing the given module

    :param module: module name, e.g. 'dara.core'
    """
    try:
        return cast(str, sys.modules[module].__file__)
    except KeyError:
        # module wasn't imported, try to load it explicitly
        imported_module = importlib.import_module(module)
        return cast(str, imported_module.__file__)


def rebuild_js(build_cache: BuildCache, build_diff: Union[BuildCacheDiff, None] = None):
    """
    Generic 'rebuild' function which bundles/prepares assets depending on the build mode chosen

    :param build_cache: current build configuration cache
    :param build_diff: the difference between the current build cache and the previous build cache
    """
    if build_diff is None:
        build_diff = BuildCacheDiff.full_diff()

    # If we are in docker mode, skip the JS build
    if os.environ.get('DARA_DOCKER_MODE', 'FALSE') == 'TRUE':
        dev_logger.debug('Docker mode, skipping JS build')
        return

    # Skip the JS build if the flag is set
    if os.environ.get('SKIP_JSBUILD', 'FALSE') == 'TRUE':
        dev_logger.debug('SKIP_JSBUILD mode, skipping JS build')
        return

    # Explitily forced a full rebuild
    if os.environ.get('DARA_JS_REBUILD', 'FALSE') == 'TRUE':
        dev_logger.debug('JS rebuild forced explicitly')
        build_diff = BuildCacheDiff.full_diff()

    # Create static dir if it does not exist
    os.makedirs(build_cache.static_files_dir, exist_ok=True)

    # JS rebuild required, run mode-specific logic
    if build_diff.should_rebuild_js():
        # If we are in autoJS mode, just prepare pre-built assets to be included directly
        if build_cache.build_config.mode == BuildMode.AUTO_JS:
            prepare_autojs_assets(build_cache)
        else:
            # In production mode, build using Vite production build
            bundle_js(build_cache)

    # Always migrate static assets
    build_cache.migrate_static_assets()

    # Store the new build cache
    build_cache_path = os.path.join(build_cache.static_files_dir, BuildCache.FILENAME)
    with open(build_cache_path, 'w+', encoding='utf-8') as f:
        f.write(build_cache.model_dump_json(indent=2))


def bundle_js(build_cache: BuildCache, copy_js: bool = False):
    """
    Bundle the JS (and CSS) in production mode using Vite

    :param build_cache: the build cache
    :param copy_js: whether to copy JS instead of symlinking it
    """
    # If custom JS is present, symlink it
    if build_cache.build_config.js_config is not None and os.path.isdir(build_cache.build_config.js_config.local_entry):
        if copy_js:
            # Just move the directory to output
            js_folder_name = os.path.basename(build_cache.build_config.js_config.local_entry)
            shutil.copytree(
                build_cache.build_config.js_config.local_entry,
                os.path.join(build_cache.static_files_dir, js_folder_name),
            )
        else:
            build_cache.symlink_js()

    # Determine template paths
    entry_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/_entry.template.tsx')
    vite_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/vite.config.template.ts')
    npmrc_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/.npmrc')
    statics = os.path.join(pathlib.Path(__file__).parent.absolute(), 'statics')

    # Ensure the static files directory exists
    os.makedirs(build_cache.static_files_dir, exist_ok=True)

    # Generate importers dict for extensions and main configuration.
    importers_dict = build_cache.get_importers()

    # Generate a package json
    package_json = build_cache.get_package_json()
    with open(os.path.join(build_cache.static_files_dir, 'package.json'), 'w+', encoding='utf-8') as f:
        f.write(json.dumps(package_json))

    # If we need to pull from a custom registry in CI where the user is not npm logged in, then add to the npmrc file
    if build_cache.build_config.npm_token is not None and build_cache.build_config.npm_registry is not None:
        # Copy .npmrc
        npmrc_location = os.path.join(build_cache.static_files_dir, '.npmrc')
        shutil.copyfile(npmrc_template, npmrc_location)

        with open(npmrc_location, 'a', encoding='utf-8') as npmrc_file:
            npmrc_file.write(f'@darajs:registry=https://{build_cache.build_config.npm_registry}\n')
            npmrc_file.write(
                f'//{build_cache.build_config.npm_registry}/:_authToken={build_cache.build_config.npm_token}'
            )

    # Copy dara-core statics, i.e. default favicon, tsconfig, etc.
    files = os.listdir(statics)
    for fname in files:
        shutil.copyfile(os.path.join(statics, fname), os.path.join(build_cache.static_files_dir, fname))

    # If a custom favicon (any .ico file) is provided, copy it to the static files dir as favicon.ico
    custom_favicon = build_cache.find_favicon()
    if custom_favicon is not None:
        shutil.copyfile(custom_favicon, os.path.join(build_cache.static_files_dir, 'favicon.ico'))

    # Run JS install
    package_manager = 'npm'

    if build_cache.build_config.js_config and build_cache.build_config.js_config.package_manager is not None:
        package_manager = build_cache.build_config.js_config.package_manager

    cwd = os.getcwd()
    os.chdir(build_cache.static_files_dir)
    dev_logger.info('Installing JS dependencies...')
    exit_code = os.system(f'{package_manager} install')  # nosec B605 # package_manager is validated
    if exit_code > 0:
        raise SystemError(
            "Failed to install the JS dependencies - there's likely a connection issue or a broken package"
        )
    dev_logger.info('JS dependencies installed successfully')

    # Load entry template as a string
    with open(entry_template, encoding='utf-8') as f:
        entry_template_str = f.read()
    with open(vite_template, encoding='utf-8') as f:
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
        f.write(vite_template_str.replace('$$output$$', './'))

    # In dev mode don't build the app, tell the user to run DEV alongside this process
    if build_cache.build_config.dev:
        dev_logger.warning('App is in DEV mode, running `dara dev` CLI command alongside this process is required')
    else:
        # Run build pointed at the generated entry file
        exit_code = os.system(f'{package_manager} run build')  # nosec B605 # package_manager is validated
        if exit_code > 0:
            raise SystemError('Failed to build the JS part of the project')

    # Return process to it's original working dir
    os.chdir(cwd)


def prepare_autojs_assets(build_cache: BuildCache):
    """
    Prepare the JS (and CSS) assets to use in autoJS mode.
    Copies over UMD pre-bundled files from loaded packages into static_files_dir directory,
    ready to be served directly without bundling.

    :param config: the main app configuration
    """
    # copy over dara.core js/css into static dir
    core_path = os.path.dirname(_get_module_file('dara.core'))
    core_js_path = os.path.join(core_path, 'umd', 'dara.core.umd.js')
    core_css_path = os.path.join(core_path, 'umd', 'style.css')
    statics = os.path.join(pathlib.Path(__file__).parent.absolute(), 'statics')

    # Copy dara-core statics, i.e. default favicon, tsconfig, etc.
    files = os.listdir(statics)
    for fname in files:
        shutil.copyfile(os.path.join(statics, fname), os.path.join(build_cache.static_files_dir, fname))

    # If a custom favicon (any .ico file) is provided, copy it to the static files dir as favicon.ico
    custom_favicon = build_cache.find_favicon()
    if custom_favicon is not None:
        shutil.copyfile(custom_favicon, os.path.join(build_cache.static_files_dir, 'favicon.ico'))

    shutil.copy(core_js_path, os.path.join(build_cache.static_files_dir, 'dara.core.umd.js'))
    shutil.copy(core_css_path, os.path.join(build_cache.static_files_dir, 'dara.core.css'))

    py_modules = build_cache.get_py_modules()

    # Copy over js/css for all modules
    for module_name in py_modules:
        # Get path to the module
        module_path = os.path.dirname(_get_module_file(module_name))

        # Build paths to the JS and CSS assets for the given module
        # Note: this assumes assets structure of module/umd folder with the module.umd.js and style.css file
        js_asset_path = os.path.join(module_path, 'umd', f'{module_name}.umd.js')
        css_asset_path = os.path.join(module_path, 'umd', 'style.css')

        # copy over the JSS/CSS from python package into dist/umd so they are available under /static
        if os.path.exists(js_asset_path):
            shutil.copy(js_asset_path, os.path.join(build_cache.static_files_dir, f'{module_name}.umd.js'))

        if os.path.exists(css_asset_path):
            shutil.copy(css_asset_path, os.path.join(build_cache.static_files_dir, f'{module_name}.css'))


def build_autojs_template(html_template: str, build_cache: BuildCache, config: Configuration) -> str:
    """
    Build the autojs html template by replacing $$assets$$ with required tags based on packages loaded
    and including the startup script

    :param html_template: html template to fill out
    :param build_cache: build cache
    :param config: app configuration
    """
    settings = get_settings()
    entry_template = os.path.join(pathlib.Path(__file__).parent.absolute(), 'templates/_entry_autojs.template.tsx')
    with open(entry_template, encoding='utf-8') as f:
        entry_template_str = f.read()

    importers_dict = build_cache.get_importers()

    # Convert importers dict to a string for injection into the template
    importers_out = '{'
    for name, _ in importers_dict.items():
        importers_out += f'"{name}": () => Promise.resolve({name}),'
    importers_out = f'{importers_out[:-1]}}}'
    start_script = entry_template_str.replace('$$importers$$', importers_out).replace(
        '$$extraJs$$', config.template_extra_js + '\n' + settings.dara_template_extra_js
    )

    package_tags: Dict[str, List[str]] = {
        'dara.core': [
            f'<script crossorigin src="{settings.dara_base_url}/static/dara.core.umd.js"></script>',
            f'<link rel="stylesheet" href="{settings.dara_base_url}/static/dara.core.css"></link>',
        ]
    }

    py_modules = build_cache.get_py_modules()

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

    return html_template.replace('$$assets$$', '\n'.join(tags)).replace('$$baseUrl$$', settings.dara_base_url)
