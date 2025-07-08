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

import logging
import os
import pathlib
import subprocess
from typing import List, Optional

import uvicorn

import click
from click.exceptions import UsageError
from dara.core.internal.port_utils import find_available_port
from dara.core.internal.settings import generate_env_file
from dara.core.internal.utils import find_module_path
from dara.core.js_tooling.js_utils import JsConfig, setup_js_scaffolding

LOG_CONFIG_PATH = os.path.join(pathlib.Path(__file__).parent, 'log_configs')

DEFAULT_PORT = 8000
DEFAULT_METRICS_PORT = 10000
PORT_RANGE = 100

logger = logging.getLogger(__name__)


@click.group()
def cli():
    pass


@cli.command()
@click.option('--reload', is_flag=True, help='Whether to reload the app on Python code changes')
@click.option('--enable-hmr', is_flag=True, help='Whether to enable Hot Module Reloading for custom JS')
@click.option('--production', is_flag=True, help='Whether to build the JS for production without custom JS')
@click.option('--config', help='The path to the config for the application')
@click.option('--port', help='The port to run on', type=int)
@click.option('--metrics-port', help='The port for the metrics server to run on', type=int)
@click.option('--disable-metrics', is_flag=True, help='Whether to disable the metrics server')
@click.option('--host', default='0.0.0.0', help='The host to run on')  # nosec B104 # default for local dev
@click.option('--rebuild', is_flag=True, help='Whether to force a rebuild of the app')
@click.option('--require-sso', is_flag=True, help='Whether to enforce that an SSO auth config is used')
@click.option('--docker', is_flag=True, help='Whether to run in Docker mode - assumes assets are prebuilt')
@click.option('--debug', default=lambda: os.environ.get('DARA_DEBUG_LOG_LEVEL', None), help='Debug logger level to use')
@click.option('--log', default=lambda: os.environ.get('DARA_DEV_LOG_LEVEL', None), help='Dev logger level to use')
@click.option('--reload-dir', multiple=True, help='Directories to watch for reload')
@click.option('--skip-jsbuild', is_flag=True, help='Whether to skip building the JS assets')
@click.option(
    '--base-url',
    default=lambda: os.environ.get('DARA_BASE_URL', None),
    help='An optional base_url for running a Dara app behind a proxy',
)
def start(
    reload: bool,
    enable_hmr: bool,
    production: bool,
    config: Optional[str],
    port: Optional[int],
    metrics_port: Optional[int],
    disable_metrics: bool,
    host: str,
    rebuild: bool,
    require_sso: bool,
    docker: bool,
    debug: Optional[str],
    log: Optional[str],
    reload_dir: Optional[List[str]],
    skip_jsbuild: bool,
    base_url: Optional[str],
):
    if config is None:
        folder_name = os.path.basename(os.getcwd()).replace('-', '_')
        config = f'{folder_name}.main:config'

    # Set the config path env var so main can pick it up
    os.environ['DARA_CONFIG_PATH'] = config

    # If not provided find an available one in the range
    if port is None:
        port = find_available_port(host, DEFAULT_PORT, DEFAULT_PORT + PORT_RANGE)

    # disable the running of the metrics server
    os.environ['DARA_DISABLE_METRICS'] = 'TRUE' if disable_metrics else 'FALSE'

    # Set the port for metrics to run on
    if not disable_metrics:
        # If not provided find an available one in the range
        if metrics_port is None:
            metrics_port = find_available_port(host, DEFAULT_METRICS_PORT, DEFAULT_METRICS_PORT + PORT_RANGE)
        os.environ['DARA_METRICS_PORT'] = str(metrics_port)

    # Force app to rebuild assets
    if rebuild:
        os.environ['DARA_JS_REBUILD'] = 'TRUE'

    if docker:
        os.environ['DARA_DOCKER_MODE'] = 'TRUE'
        os.environ['DARA_REQUIRE_SSO'] = 'TRUE'

    if production:
        os.environ['DARA_PRODUCTION_MODE'] = 'TRUE'

    # This enables HotModuleReloading when enable_hmr=True
    if enable_hmr:
        os.environ['DARA_HMR_MODE'] = 'TRUE'
        os.environ['VITE_HOT_RELOAD'] = 'True'
        os.environ['VITE_IS_REACT'] = 'True'
    else:
        os.environ['DARA_HMR_MODE'] = 'FALSE'
        os.environ['VITE_HOT_RELOAD'] = 'False'
        os.environ['VITE_IS_REACT'] = 'False'

    # Tell frontend to restart on WS reconnection
    if reload:
        os.environ['DARA_LIVE_RELOAD'] = 'TRUE'

    # Skip rebuild js assets
    if skip_jsbuild:
        os.environ['SKIP_JSBUILD'] = 'TRUE'

    # Ensure the base_url is set as an env var as well
    if base_url:
        os.environ['DARA_BASE_URL'] = base_url
        os.environ['VITE_STATIC_URL'] = f'{base_url}/static/'
    else:
        # Needs to match where the static files are mounted at in the router
        os.environ['VITE_STATIC_URL'] = '/static/'

    # Check that if production/dev mode is set, node is installed - unless we're in docker mode, or explicitly skipping jsbuild
    if not docker and not skip_jsbuild and (production or enable_hmr):
        exit_code = os.system('node -v')

        if exit_code > 0:
            raise SystemError('NodeJS is required in production mode.')

    logging_config = os.path.join(LOG_CONFIG_PATH, 'logging.yaml')

    os.environ['DARA_DEBUG_LOG_LEVEL'] = debug or 'NONE'
    os.environ['DARA_DEV_LOG_LEVEL'] = log or 'NONE'

    limit_max_requests = None

    env_limit = os.environ.get('LIMIT_MAX_REQUESTS', None)
    if env_limit is not None and env_limit.isnumeric():
        limit_max_requests = int(env_limit)

    # Set the flag to check at runtime
    if require_sso:
        os.environ['DARA_ENFORCE_SSO'] = 'TRUE'

    dirs_to_watch = None

    if reload:
        # If specified, use the provided directories
        if reload_dir:
            dirs_to_watch = reload_dir
        else:
            # Otherwise try to infer the path to watch
            try:
                module_parent = find_module_path(config)
                dirs_to_watch = [module_parent]
            except Exception as e:
                logger.warn(f'Could not infer path to watch: {str(e)}')

    # Exclude node_modules to prevent watcher trying to parse node_modules its symlinks
    uvicorn.run(
        'dara.core.main:start',
        host=host,
        port=port,
        reload=reload,
        reload_dirs=dirs_to_watch,
        log_config=logging_config,
        limit_max_requests=limit_max_requests,
        lifespan='on',
        # This matches the default on the uvicorn cli
        root_path='' if base_url is None else base_url,
    )


@cli.command()
def setup_custom_js():
    setup_js_scaffolding()


@cli.command()
def dev():
    # Run vite dev command, printing output live
    js_config = JsConfig.from_file()

    package_manager = 'npm'

    if js_config and js_config.package_manager:
        package_manager = js_config.package_manager

    os.chdir(os.path.join(os.getcwd(), 'dist'))
    with subprocess.Popen(  # nosec B602 # package manager is validated
        f'{package_manager} run dev',
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
    ) as vite_process:
        if vite_process.stdout is not None:
            for line in vite_process.stdout:
                decoded_line = line.decode('utf-8').strip()
                if decoded_line != '':
                    print(decoded_line)


@cli.command()
@click.option('--force', is_flag=True, help='Whether to forcefully re-create .env file even if it exists')
def generate_env(force: bool):
    env_path = os.path.join(os.getcwd(), '.env')

    if os.path.isfile(env_path) and not force:
        raise UsageError('.env file already exists, use --force to re-create it')

    generate_env_file()
