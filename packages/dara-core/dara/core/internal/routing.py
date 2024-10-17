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

import inspect
import json
import os
from functools import wraps
from importlib.metadata import version
from typing import Any, Callable, Dict, List, Mapping, Optional

import anyio
import pandas
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pandas import DataFrame
from pydantic import BaseModel
from starlette.background import BackgroundTask

from dara.core.auth.routes import verify_session
from dara.core.base_definitions import ActionResolverDef, BaseTask, UploadResolverDef
from dara.core.configuration import Configuration
from dara.core.interactivity.any_data_variable import DataVariableRegistryEntry, upload
from dara.core.interactivity.filtering import FilterQuery, Pagination
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.download import DownloadRegistryEntry
from dara.core.internal.execute_action import CURRENT_ACTION_ID
from dara.core.internal.normalization import NormalizedPayload, denormalize, normalize
from dara.core.internal.pandas_utils import df_to_json
from dara.core.internal.registries import (
    action_def_registry,
    action_registry,
    backend_store_registry,
    component_registry,
    data_variable_registry,
    derived_variable_registry,
    latest_value_registry,
    static_kwargs_registry,
    template_registry,
    upload_resolver_registry,
    utils_registry,
)
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.settings import get_settings
from dara.core.internal.tasks import TaskManager, TaskManagerError
from dara.core.internal.utils import get_cache_scope
from dara.core.internal.websocket import WS_CHANNEL, ws_handler
from dara.core.logging import dev_logger
from dara.core.persistence import BackendStoreEntry
from dara.core.visual.dynamic_component import CURRENT_COMPONENT_ID, PyComponentDef


def error_decorator(handler: Callable[..., Any]):
    """Wrapper for routes to improve the default error message in the framework"""
    if inspect.iscoroutinefunction(handler):

        @wraps(handler)
        async def _async_inner_func(*args, **kwargs):
            try:
                return await handler(*args, **kwargs)
            except Exception as err:
                # If HTTPException was raised directly just re-raise
                if isinstance(err, HTTPException):
                    raise err
                dev_logger.error('Unhandled error', error=err)
                raise HTTPException(status_code=500, detail=str(err))

        return _async_inner_func

    @wraps(handler)
    def _inner_func(*args, **kwargs):
        try:
            return handler(*args, **kwargs)
        except Exception as err:
            # If HTTPException was raised directly just re-raise
            if isinstance(err, HTTPException):
                raise err
            dev_logger.error('Unhandled error', error=err)
            raise HTTPException(status_code=500, detail=str(err))

    return _inner_func


def create_router(config: Configuration):
    """
    Create the main Dara core API router

    :param config: Dara app configuration
    """
    core_api_router = APIRouter()

    @core_api_router.get('/actions', dependencies=[Depends(verify_session)])
    async def get_actions():   # pylint: disable=unused-variable
        return action_def_registry.get_all().items()

    class ActionRequestBody(BaseModel):
        values: NormalizedPayload[Mapping[str, Any]]
        """Dynamic kwarg values"""

        input: Any
        """Input from the component"""

        ws_channel: str
        """Websocket channel assigned to the client"""

        uid: str
        """Instance uid"""

        execution_id: str
        """Execution id, unique to this request"""

    @core_api_router.post('/action/{uid}', dependencies=[Depends(verify_session)])
    async def get_action(uid: str, body: ActionRequestBody):  # pylint: disable=unused-variable
        store: CacheStore = utils_registry.get('Store')
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
        action_def: ActionResolverDef = await registry_mgr.get(action_registry, uid)

        CURRENT_ACTION_ID.set(body.uid)
        WS_CHANNEL.set(body.ws_channel)

        # Denormalize the values
        values = denormalize(body.values.data, body.values.lookup)

        # Fetch static kwargs
        static_kwargs = await registry_mgr.get(static_kwargs_registry, body.uid)

        # Execute the action - kick off a background task to run the handler
        response = await action_def.execute_action(
            action_def, body.input, values, static_kwargs, body.execution_id, body.ws_channel, store, task_mgr
        )

        if isinstance(response, BaseTask):
            await task_mgr.run_task(response, body.ws_channel)
            return {'task_id': response.task_id}

        return {'execution_id': response}

    @core_api_router.get('/download')
    async def get_download(code: str):   # pylint: disable=unused-variable
        store: CacheStore = utils_registry.get('Store')

        try:
            data_entry = await store.get(DownloadRegistryEntry, key=code)

            if data_entry is None:
                raise ValueError('Invalid or expired download code')

            async_file, cleanup = await data_entry.download(data_entry)

            file_name = os.path.basename(data_entry.file_path)

            # This mirrors builtin's FastAPI FileResponse implementation
            async def stream_file():
                has_content = True
                chunk_size = 64 * 1024
                while has_content:
                    chunk = await async_file.read(chunk_size)
                    has_content = chunk_size == len(chunk)
                    yield chunk

            return StreamingResponse(
                content=stream_file(),
                headers={'Content-Disposition': f'attachment; filename={file_name}'},
                background=BackgroundTask(cleanup),
            )

        except KeyError:
            raise ValueError('Invalid or expired download code')

    @core_api_router.get('/config', dependencies=[Depends(verify_session)])
    async def get_config():  # pylint: disable=unused-variable
        return {
            **config.dict(
                include={
                    'enable_devtools',
                    'live_reload',
                    'template',
                    'theme',
                    'title',
                    'context_components',
                    'powered_by_causalens',
                }
            ),
            'application_name': get_settings().project_name,
        }

    @core_api_router.get('/auth-components')
    async def get_auth_components():  # pylint: disable=unused-variable
        return config.auth_config.component_config

    @core_api_router.get('/components', dependencies=[Depends(verify_session)])
    async def get_components(name: Optional[str] = None):  # pylint: disable=unused-variable
        """
        If name is passed, will try to register the component

        :param name: the name of component
        """
        if name is not None:
            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
            await registry_mgr.get(component_registry, name)

        return {k: comp.dict(exclude={'func'}) for k, comp in component_registry.get_all().items()}

    class ComponentRequestBody(BaseModel):
        # Dynamic kwarg values
        values: NormalizedPayload[Mapping[str, Any]]
        # Instance uid
        uid: str
        # Websocket channel assigned to the client
        ws_channel: str

    @core_api_router.post('/components/{component}', dependencies=[Depends(verify_session)])
    async def get_component(component: str, body: ComponentRequestBody):  # pylint: disable=unused-variable
        CURRENT_COMPONENT_ID.set(body.uid)
        WS_CHANNEL.set(body.ws_channel)
        store: CacheStore = utils_registry.get('Store')
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
        comp_def = await registry_mgr.get(component_registry, component)

        if isinstance(comp_def, PyComponentDef):
            static_kwargs = await registry_mgr.get(static_kwargs_registry, body.uid)
            values = denormalize(body.values.data, body.values.lookup)

            response = await comp_def.render_component(comp_def, store, task_mgr, values, static_kwargs)

            dev_logger.debug(
                f'PyComponent {comp_def.func.__name__ if comp_def.func else "anonymous"}',
                'return value',
                {'value': response},
            )

            if isinstance(response, BaseTask):
                await task_mgr.run_task(response, body.ws_channel)
                return {'task_id': response.task_id}

            return response

        raise HTTPException(status_code=400, detail='Requesting this type of component is not supported')

    @core_api_router.get('/derived-variable/{uid}/latest', dependencies=[Depends(verify_session)])
    async def get_latest_derived_variable(uid: str):  # pylint: disable=unused-variable
        try:
            store: CacheStore = utils_registry.get('Store')
            latest_value_entry = latest_value_registry.get(uid)
            variable_entry = derived_variable_registry.get(uid)

            # Lookup the latest key in the cache
            scope = get_cache_scope(variable_entry.cache.cache_type if variable_entry.cache else None)
            latest_key = await store.get(latest_value_entry, key=scope)

            if latest_key is None:
                return None

            # Lookup latest value for that key
            latest_value = await store.get_or_wait(variable_entry, key=latest_key)

            dev_logger.debug(
                f'DerivedVariable {variable_entry.uid[:3]}..{variable_entry.uid[-3:]}',
                'latest value',
                {'value': latest_value, 'uid': uid},
            )
            return latest_value

        except KeyError as err:
            raise ValueError(f'Could not find latest value for derived variable with uid: {uid}').with_traceback(
                err.__traceback__
            )

    class DataVariableRequestBody(BaseModel):
        filters: Optional[FilterQuery]
        cache_key: Optional[str]
        ws_channel: Optional[str]

    @core_api_router.post('/data-variable/{uid}', dependencies=[Depends(verify_session)])
    async def get_data_variable(
        uid: str,
        body: DataVariableRequestBody,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
        order_by: Optional[str] = None,
        index: Optional[str] = None,
    ):   # pylint: disable=unused-variable
        try:
            store: CacheStore = utils_registry.get('Store')
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
            data_variable_entry: DataVariableRegistryEntry = await registry_mgr.get(data_variable_registry, uid)

            data = None
            WS_CHANNEL.set(body.ws_channel)

            if data_variable_entry.type == 'derived':
                if body.cache_key is None:
                    raise HTTPException(status_code=400, detail='Cache key is required for derived data variables')

                if body.ws_channel is None:
                    raise HTTPException(
                        status_code=400, detail='Websocket channel is required for derived data variables'
                    )

                derived_variable_entry = await registry_mgr.get(derived_variable_registry, uid)

                data = await data_variable_entry.get_data(
                    derived_variable_entry,
                    data_variable_entry,
                    body.cache_key,
                    store,
                    body.filters,
                    Pagination(offset=offset, limit=limit, orderBy=order_by, index=index),
                    format_for_display=True,
                )
                if isinstance(data, BaseTask):
                    await task_mgr.run_task(data, body.ws_channel)
                    return {'task_id': data.task_id}
            elif data_variable_entry.type == 'plain':
                data = await data_variable_entry.get_data(
                    data_variable_entry,
                    store,
                    body.filters,
                    Pagination(offset=offset, limit=limit, orderBy=order_by, index=index),
                    format_for_display=True,
                )

            dev_logger.debug(
                f'DataVariable {data_variable_entry.uid[:3]}..{data_variable_entry.uid[-3:]}',
                'return value',
                {'value': data.describe() if isinstance(data, pandas.DataFrame) else None, 'uid': uid},  # type: ignore
            )

            if data is None:
                return None

            # Explicitly convert to JSON to avoid implicit serialization;
            # return as records as that makes more sense in a JSON structure
            return Response(
                content=df_to_json(data) if isinstance(data, pandas.DataFrame) else data, media_type='application/json'
            )   # type: ignore
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    class DataVariableCountRequestBody(BaseModel):
        cache_key: Optional[str]
        filters: Optional[FilterQuery]

    @core_api_router.post('/data-variable/{uid}/count', dependencies=[Depends(verify_session)])
    async def get_data_variable_count(uid: str, body: Optional[DataVariableCountRequestBody] = None):
        try:
            store: CacheStore = utils_registry.get('Store')
            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
            variable_def = await registry_mgr.get(data_variable_registry, uid)

            if variable_def.type == 'plain':
                return await variable_def.get_total_count(
                    variable_def, store, body.filters if body is not None else None
                )

            if body is None or body.cache_key is None:
                raise HTTPException(
                    status_code=400, detail="Cache key is required when requesting DerivedDataVariable's count"
                )

            return await variable_def.get_total_count(variable_def, store, body.cache_key, body.filters)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @core_api_router.get('/data-variable/{uid}/schema', dependencies=[Depends(verify_session)])
    async def get_data_variable_schema(uid: str, cache_key: Optional[str] = None):
        try:
            store: CacheStore = utils_registry.get('Store')
            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
            data_def = await registry_mgr.get(data_variable_registry, uid)

            if data_def.type == 'plain':
                return await data_def.get_schema(data_def, store)

            if cache_key is None:
                raise HTTPException(
                    status_code=400, detail='Cache key is required when requesting DerivedDataVariable schema'
                )

            # Use the other registry for derived variables
            derived_ref = await registry_mgr.get(derived_variable_registry, uid)
            data = await data_def.get_schema(derived_ref, store, cache_key)
            content = json.dumps(jsonable_encoder(data)) if isinstance(data, dict) else data
            return Response(content=content, media_type='application/json')
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @core_api_router.post('/data/upload', dependencies=[Depends(verify_session)])
    async def upload_data(
        data_uid: Optional[str] = None,
        data: UploadFile = File(),
        resolver_id: Optional[str] = Form(default=None),
    ):
        """
        Upload endpoint.
        Can run a custom resolver_id (if previously registered, otherwise runs a default one)
        and update a data variable with its return value (if target is specified).
        """
        registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

        if data_uid is None and resolver_id is None:
            raise HTTPException(400, 'Neither resolver_id or data_uid specified, at least one of them is required')

        try:
            # If resolver id is provided, run the custom
            if resolver_id:
                upload_resolver_def: UploadResolverDef = await registry_mgr.get(upload_resolver_registry, resolver_id)
                await upload_resolver_def.upload(data, data_uid, resolver_id)
            else:
                # Run the default logic as a fallback, e.g. programmatic upload
                await upload(data, data_uid, resolver_id)

            return {'status': 'SUCCESS'}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    class DerivedStateRequestBody(BaseModel):
        values: NormalizedPayload[List[Any]]
        force: bool
        ws_channel: str
        is_data_variable: Optional[bool] = False

    @core_api_router.post('/derived-variable/{uid}', dependencies=[Depends(verify_session)])
    async def get_derived_variable(uid: str, body: DerivedStateRequestBody):  # pylint: disable=unused-variable
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        store: CacheStore = utils_registry.get('Store')
        registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
        variable_def = await registry_mgr.get(derived_variable_registry, uid)

        values = denormalize(body.values.data, body.values.lookup)

        result = await variable_def.get_value(variable_def, store, task_mgr, values, body.force)

        response: Any = result

        WS_CHANNEL.set(body.ws_channel)

        if isinstance(result['value'], BaseTask):
            # Kick off the task
            await task_mgr.run_task(result['value'], body.ws_channel)
            response = {'task_id': result['value'].task_id, 'cache_key': result['cache_key']}

        dev_logger.debug(
            f'DerivedVariable {variable_def.uid[:3]}..{variable_def.uid[-3:]}',
            'return value',
            {'value': response, 'uid': uid},
        )

        # Return {cache_key: <cache_key>, value: <value>}
        return response

    @core_api_router.get('/store/{store_uid}', dependencies=[Depends(verify_session)])
    async def read_backend_store(store_uid: str):
        registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
        store_entry: BackendStoreEntry = await registry_mgr.get(backend_store_registry, store_uid)
        result = store_entry.store.read()

        # Backend implementation could return a coroutine
        if inspect.iscoroutine(result):
            result = await result

        return result

    @core_api_router.post('/store', dependencies=[Depends(verify_session)])
    async def sync_backend_store(values: Dict[str, Any] = Body()):
        registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

        async def _write(store_uid: str, value: Any):
            store_entry: BackendStoreEntry = await registry_mgr.get(backend_store_registry, store_uid)
            result = store_entry.store.write(value)

            # Backend implementation could return a coroutine
            if inspect.iscoroutine(result):
                await result

        async with anyio.create_task_group() as tg:
            for store_uid, value in values.items():
                tg.start_soon(_write, store_uid, value)

    @core_api_router.get('/tasks/{task_id}', dependencies=[Depends(verify_session)])
    async def get_task_result(task_id: str):   # pylint: disable=unused-variable
        try:
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            res = await task_mgr.get_result(task_id)

            dev_logger.debug(
                f'Retrieving result for Task {task_id}',
                'return value',
                {'value': res},
            )

            # Serialize dataframes correctly
            if isinstance(res, DataFrame):
                return Response(df_to_json(res))

            return res
        except Exception as e:
            raise ValueError(f'The result for task id {task_id} could not be found').with_traceback(e.__traceback__)

    @core_api_router.delete('/tasks/{task_id}', dependencies=[Depends(verify_session)])
    async def cancel_task(task_id: str):   # pylint: disable=unused-variable
        try:
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            return await task_mgr.cancel_task(task_id)
        except TaskManagerError as e:
            dev_logger.error(f'The task id {task_id} could not be found, it may have already been cancelled', e)

    @core_api_router.get('/template/{template}', dependencies=[Depends(verify_session)])
    async def get_template(template: str):  # pylint: disable=unused-variable
        try:
            selected_template = template_registry.get(template)
            normalized_template, lookup = normalize(selected_template.dict())
            return {'data': normalized_template, 'lookup': lookup}
        except KeyError:
            raise HTTPException(status_code=404, detail=f'Template: {template}, not found in registry')
        except Exception as e:
            dev_logger.error('Something went wrong while trying to get the template', e)

    @core_api_router.get('/version', dependencies=[Depends(verify_session)])
    async def get_version():
        return {'version': version('dara_core')}

    # Add the main websocket connection
    core_api_router.add_api_websocket_route('/ws', ws_handler)

    return core_api_router
