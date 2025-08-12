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

import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from importlib.util import find_spec
from inspect import iscoroutine
from pathlib import Path
from typing import Optional

from anyio import create_task_group
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from prometheus_client import start_http_server
from starlette.templating import Jinja2Templates, _TemplateResponse

from dara.core.auth import auth_router
from dara.core.configuration import Configuration, ConfigurationBuilder
from dara.core.defaults import (
    blank_template,
    default_template,
    top_menu_template,
    top_template,
)
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.cgroup import get_cpu_count, set_memory_limit
from dara.core.internal.custom_response import CustomResponse
from dara.core.internal.devtools import send_error_for_session
from dara.core.internal.encoder_registry import encoder_registry
from dara.core.internal.pool import TaskPool
from dara.core.internal.registries import (
    action_def_registry,
    auth_registry,
    component_registry,
    config_registry,
    custom_ws_handlers_registry,
    latest_value_registry,
    sessions_registry,
    template_registry,
    utils_registry,
    websocket_registry,
)
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.routing import create_router, error_decorator
from dara.core.internal.settings import get_settings
from dara.core.internal.tasks import TaskManager
from dara.core.internal.utils import enforce_sso, import_config
from dara.core.internal.websocket import WebsocketManager
from dara.core.js_tooling.js_utils import (
    BuildCache,
    BuildMode,
    build_autojs_template,
    rebuild_js,
)
from dara.core.logging import LoggingMiddleware, dev_logger, eng_logger, http_logger


def _start_application(config: Configuration):
    """
    Helper to start the application with a config passed. This is split out from main so that it can be used directly
    for testing purposes.

    :param config: the app configuration
    """
    # Clear env cache in case we're re-running the app and get_settings was called too early
    get_settings.cache_clear()

    # Check we have a config
    if isinstance(config, Configuration) is False:
        raise ValueError('Invalid Configuration class passed to Dara Core. Did you forget to call _to_configuration()?')

    # Setup the main template to work with Vite
    os.environ['VITE_MANIFEST_PATH'] = f'{config.static_files_dir}/manifest.json'
    os.environ['VITE_STATIC_PATH'] = config.static_files_dir
    import fastapi_vite_dara
    import fastapi_vite_dara.config

    if len(config.pages) > 0:
        BASE_DIR = Path(__file__).parent
        jinja_templates = Jinja2Templates(directory=str(Path(BASE_DIR, 'jinja')))
        jinja_templates.env.globals['vite_hmr_client'] = fastapi_vite_dara.vite_hmr_client
        jinja_templates.env.globals['vite_asset'] = fastapi_vite_dara.vite_asset
        jinja_templates.env.globals['static_url'] = fastapi_vite_dara.config.settings.static_url
        jinja_templates.env.globals['base_url'] = os.getenv('DARA_BASE_URL', '')
        jinja_templates.env.globals['entry'] = '_entry.tsx'

        # If --enable-hmr or --reload enabled, set live reload to true
        if os.environ.get('DARA_HMR_MODE') == 'TRUE' or os.environ.get('DARA_LIVE_RELOAD') == 'TRUE':
            config.live_reload = True

    # Configure the default executor for threads run via the async loop
    loop = asyncio.get_event_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=int(os.environ.get('DARA_NUM_COMPONENT_THREADS', '8'))))

    is_production = os.environ.get('DARA_DOCKER_MODE') == 'TRUE'

    # Setup registries:
    # 1) cleanup ones which store results etc so if Dara is ran in a thread and restarted we get a fresh state
    # 2) cleanup utils registry so we get a fresh set of internals
    # We're explicitly not cleaning up components etc as components are registered beforehand
    # so cleaning them up here would result in an error
    latest_value_registry.replace({}, deepcopy=False)
    websocket_registry.replace({}, deepcopy=False)
    sessions_registry.replace({}, deepcopy=False)
    config_registry.replace({}, deepcopy=False)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # STARTUP

        # Retrieve the existing Store instance for the application
        # Store must exist before the app starts as instantiating e.g. Variables
        # requires a store existing
        store: CacheStore = utils_registry.get('Store')
        utils_registry.set('RegistryLookup', RegistryLookup(config.registry_lookup))

        # Create a task group for the application so we can kick off tasks in the background
        async with create_task_group() as task_group:
            ws_manager = WebsocketManager()
            task_manager = TaskManager(task_group, ws_manager, store)

            # Add other internals
            utils_registry.set('TaskGroup', task_group)
            utils_registry.set('WebsocketManager', ws_manager)
            utils_registry.set('TaskManager', task_manager)

            utils_registry.set('TaskPool', None)

            task_pool: Optional[TaskPool] = None

            # Only initialize the pool if a task module is configured
            if config.task_module:
                # Verify task module exists
                task_module_spec = find_spec(config.task_module)
                if task_module_spec is None or not task_module_spec.name.endswith('.tasks'):
                    raise RuntimeError(
                        f'Task module {config.task_module} does not exist or is invalid. Set config.task_module path to a tasks.py module'
                    )

                # Default to number of CPUs - 1 (with minimum of 1)
                cpu_count = get_cpu_count()
                max_workers = int(os.environ.get('DARA_POOL_MAX_WORKERS', max(1, cpu_count - 1)))
                dev_logger.info(
                    'Initializing task pool...',
                    {
                        'max_workers': max_workers,
                        'task_module': config.task_module,
                    },
                )
                task_pool = TaskPool(
                    task_group=task_group,
                    worker_parameters={'task_module': config.task_module},
                    max_workers=max_workers,
                )
                await task_pool.start(60)  # timeout after 60s
                utils_registry.set('TaskPool', task_pool)
                dev_logger.info('Task pool initialized')

            # App is now ready, call user-defined startup functions
            eng_logger.info(f'Running {len(config.startup_functions)} local startup functions')
            for startup_function in config.startup_functions:
                res = startup_function()

                # Check if the response is awaitable and if it is then wait for it
                if iscoroutine(res):
                    await res

            # Yield back to the app
            yield

            # SHUTDOWN
            eng_logger.debug('App shutting down, attempting to cancel all tasks and shut down the task pool')
            await task_manager.cancel_all_tasks()

            if task_pool is not None:
                eng_logger.debug('Shutting down task pool...')
                await task_pool.join(5)
                eng_logger.debug('Task pool shut down')

    app = FastAPI(
        lifespan=lifespan,
        docs_url=None if is_production else '/docs',
        redoc_url=None if is_production else '/redoc',
        default_response_class=CustomResponse,
    )

    # Define catch-all mechanisms
    @app.middleware('http')
    async def catchall_middleware(req: Request, call_next):
        try:
            return await call_next(req)
        except Exception as e:
            try:
                ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
                session_id = req.state.session_id
                await send_error_for_session(ws_mgr, session_id)
            except AttributeError:
                # i.e. unauthenticated endpoint
                eng_logger.debug('Error could not be sent as no session was found in the request state')
            raise e

    # Setup http logger
    if os.environ.get('DARA_TEST_FLAG', None) is None:
        app.add_middleware(LoggingMiddleware, logger=http_logger)

    # Add custom middlewares
    for middleware in config.middlewares:
        app.user_middleware.insert(0, middleware)

    # Loop over scheduled jobs and start them
    eng_logger.info(f'Starting {len(config.scheduled_jobs)} local scheduled jobs')
    for job, func, args in config.scheduled_jobs:
        job.do(func, args)

    route_urls = [f'"/api/{route.url}"' for route in config.routes]
    eng_logger.info(f'Registering local routes [{", ".join(route_urls)}]')

    # Add endpoint configurations to registry
    for conf in config.endpoint_configurations:
        config_registry.register(conf.__class__.__name__, conf)

    # Register collected endpoints
    for route in config.routes:
        clean_url = f'/api/{route.url}'.replace('//', '/')
        app.add_api_route(
            path=clean_url,
            endpoint=error_decorator(route.handler),
            dependencies=route.dependencies,
            methods=[route.method.value],
        )

    # Add WS handlers
    for kind, handler in config.ws_handlers.items():
        custom_ws_handlers_registry.register(kind, handler)

    # update encoder registry
    encoder_registry.update(config.encoders)

    # Inject the encoder to pydantic ENCODERS_BY_TYPE, which will be called in fastapi jsonable_encoder
    for key, value in encoder_registry.items():
        ENCODERS_BY_TYPE[key] = value['serialize']

    # Generate a new build_cache
    try:
        build_cache = BuildCache.from_config(config)
        build_diff = build_cache.get_diff()

        # Only build if there's pages to build, otherwise assume Dara is only used for API
        if len(config.pages) > 0:
            dev_logger.debug(
                'Building JS...',
                extra={
                    'New build cache': build_cache.model_dump(),
                    'Difference from last cache': build_diff.model_dump(),
                },
            )
            rebuild_js(build_cache, build_diff)

    except Exception as e:
        dev_logger.error('Error building JS', error=e)
        sys.exit(1)

    # Loop over registered components and add to the registry
    eng_logger.info(f'Registering components [{", ".join([c.name for c in config.components])}]')
    for component in config.components:
        component_registry.register(component.name, component)

    # Loop over registered actions and add to the registry
    eng_logger.info(f'Registering actions [{", ".join([a.name for a in config.actions])}]')
    for action in config.actions:
        action_def_registry.register(action.name, action)

    dev_logger.info(f'Using {config.auth_config.__class__.__name__} auth configuration')
    auth_registry.register('auth_config', config.auth_config)

    try:
        eng_logger.info('Registering template')

        # Add the default templates
        if config.template == 'default':
            eng_logger.info('Registering template "default"')
            template_registry.register('default', default_template(config))
        elif config.template == 'blank':
            eng_logger.info('Registering template "blank"')
            template_registry.register('blank', blank_template(config))
        elif config.template == 'top':
            eng_logger.info('Registering template "top"')
            template_registry.register('top', top_template(config))
        elif config.template == 'top-menu':
            eng_logger.info('Registering template "top-menu"')
            template_registry.register('top-menu', top_menu_template(config))
        else:
            # Loop over user defined templates and add to the registry
            for name, renderer in config.template_renderers.items():
                if name == config.template:
                    eng_logger.info(f'Registering custom template "{name}"')
                    template_registry.register(name, renderer(config))

    except Exception as e:
        import traceback

        traceback.print_exc()
        dev_logger.error(
            'Something went wrong when building application template, there is most likely an issue in the application logic',
            e,
        )
        sys.exit(1)

    # Root routes

    @app.get('/status')
    async def status():
        """
        Used by liveness probes to check application responds to HTTP requests
        """
        return {'status': 'ok'}

    # Register the core routes of the application
    core_api_router = create_router(config)

    # Start metrics server in a daemon thread
    if os.environ.get('DARA_DISABLE_METRICS') != 'TRUE' and os.environ.get('DARA_TEST_FLAG', None) is None:
        port = int(os.environ.get('DARA_METRICS_PORT', '10000'))
        start_http_server(port)

    # Start profiling server in a daemon thread if explicitly enabled (only works on linux)
    if os.environ.get('DARA_PYPPROF_PORT', None) is not None:
        profiling_port = int(os.environ.get('DARA_PYPPROF_PORT', '10001'))
        dev_logger.warning('Starting cpu/memory profiling server', extra={'port': profiling_port})

        from pypprof.net_http import start_pprof_server  # pyright: ignore[reportMissingImports]

        start_pprof_server(port=profiling_port)

    # Serve statics, only if we have any pages defined
    if len(config.pages) > 0:
        app.mount('/static', StaticFiles(directory=config.static_files_dir), name='static')

    # Mount Routers
    app.include_router(auth_router, prefix='/api/auth')
    app.include_router(core_api_router, prefix='/api/core')

    @app.get('/api/{rest_of_path:path}')
    async def not_found():
        raise HTTPException(status_code=404, detail='API endpoint not found')

    if len(config.pages) > 0:
        dev_logger.info(f'Registering pages: [{", ".join(list(config.pages.keys()))}]')
        # For any unmatched route then serve the app to the user if we have any pages to serve
        # (Required for the chosen routing system in the UI)

        # Auto-js mode - serve the built template with UMDs
        if build_cache.build_config.mode == BuildMode.AUTO_JS:
            # Load template
            template_path = os.path.join(Path(BASE_DIR, 'jinja'), 'index_autojs.html')  # type: ignore
            with open(template_path, encoding='utf-8') as fp:
                template = fp.read()

            # Generate tags for the template
            template = build_autojs_template(template, build_cache, config)

            @app.get('/{full_path:path}', include_in_schema=False, response_class=HTMLResponse)
            async def serve_app(request: Request):  # pyright: ignore[reportRedeclaration]
                return HTMLResponse(template)

        else:
            # Otherwise serve the Vite template

            @app.get('/{full_path:path}', include_in_schema=False, response_class=_TemplateResponse)
            async def serve_app(request: Request):  # pyright: ignore[reportRedeclaration]
                return jinja_templates.TemplateResponse(request, 'index.html')  # type: ignore

    return app


def start(extra=None):
    """
    The start function reads the Configuration for an application from DARA_CONFIG_PATH env var
    and creates an ASGI instance of FastAPI to serve the app. See the project docs for more
    details

    Note: start takes an extra param in case `uvicorn` passes extra data here. It's not currently used but
    it's necessary to prevent errors such as `start() takes 0 positional arguments but 1 was given` happening
    which prevent real errors from showing up in the console.
    """
    # Set debug logging level based on the environment variable set by CLI
    debug_level = os.environ.get('DARA_DEBUG_LOG_LEVEL', 'NONE')
    if debug_level != 'NONE':
        eng_logger._logger.setLevel(debug_level)

        # In DEBUG mode also enable detailed http logs
        if debug_level == 'DEBUG':
            http_logger._logger.setLevel('DEBUG')
    else:
        # To propertly disable we need to both disable the logger and ensure it doesn't propagate it's log messages
        eng_logger._logger.disabled = True
        eng_logger._logger.propagate = False

    # Set dev logging level based on the environment variable set by CLI
    dev_level = os.environ.get('DARA_DEV_LOG_LEVEL', 'NONE')
    if dev_level != 'NONE':
        dev_logger._logger.setLevel(dev_level)
    else:
        dev_logger._logger.setLevel('INFO')

    # First load the configuration based on the environment variable
    config_path = os.environ.get('DARA_CONFIG_PATH')
    dev_logger.info(f'Loading configuration from {config_path}')

    if config_path is None:
        raise ValueError(
            'Missing config path. Please start the application via the cli or set the DARA_CONFIG_PATH env var'
        )

    if get_settings().cgroup_memory_limit_enabled:
        set_memory_limit()

    config_module, config = import_config(config_path)

    if not isinstance(config, ConfigurationBuilder):
        raise ValueError(f'"config" object in {config_path} is not an instance of ConfigurationBuilder')

    # Enforce SSO at this point - this runs on each reload
    if os.environ.get('DARA_ENFORCE_SSO') == 'TRUE':
        enforce_sso(config)

    config._run_discovery(config_module)

    return _start_application(config=config._to_configuration())
