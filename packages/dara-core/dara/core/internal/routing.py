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
import io
import os
from functools import wraps
from importlib.metadata import version
from typing import Any, Callable, List, Mapping, Optional, cast

import pandas
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pandas import DataFrame
from pydantic import BaseModel
from starlette.background import BackgroundTask

from dara.core.auth.routes import verify_session
from dara.core.base_definitions import BaseTask, PendingTask
from dara.core.configuration import Configuration
from dara.core.interactivity.actions import ActionContext, ActionInputs
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.filtering import FilterQuery, Pagination
from dara.core.internal.download import get_by_code
from dara.core.internal.execute_action import execute_action
from dara.core.internal.normalization import NormalizedPayload, denormalize, normalize
from dara.core.internal.pandas_utils import df_to_json
from dara.core.internal.registries import (
    action_def_registry,
    action_registry,
    component_registry,
    data_variable_registry,
    derived_variable_registry,
    latest_value_registry,
    static_kwargs_registry,
    template_registry,
    utils_registry,
)
from dara.core.internal.settings import get_settings
from dara.core.internal.store import Store
from dara.core.internal.tasks import TaskManager, TaskManagerError
from dara.core.internal.utils import get_cache_scope
from dara.core.internal.websocket import ws_handler
from dara.core.logging import dev_logger
from dara.core.visual.dynamic_component import PyComponentDef, render_component


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

    class ActionRequestBody(BaseModel):
        # Extra values passed into action context - could contain ResolvedDerivedVariable constructs
        extras: Optional[NormalizedPayload[List[Any]]]
        # Inputs passed to the action context
        inputs: dict
        # Websocket channel assigned to the client
        ws_channel: str

    @core_api_router.get('/actions', dependencies=[Depends(verify_session)])
    async def get_actions():   # pylint: disable=unused-variable
        return action_def_registry.get_all().items()

    @core_api_router.post('/action/{uid}', dependencies=[Depends(verify_session)])
    async def get_action(uid: str, body: ActionRequestBody):  # pylint: disable=unused-variable
        try:
            store: Store = utils_registry.get('Store')
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            action = action_registry.get(uid)
            extras = None

            # If extras was provided, it was normalized
            if body.extras is not None:
                extras = denormalize(body.extras.data, body.extras.lookup)

            ctx = ActionContext(inputs=ActionInputs(**body.inputs), extras=extras)

            result = await execute_action(action, ctx, store, task_mgr)

            # MetaTask was created so run it and return it's ID
            if isinstance(result, BaseTask):
                await task_mgr.run_task(result, body.ws_channel)
                return {'task_id': result.task_id}

            return result
        except KeyError as e:
            raise ValueError(
                f'Could not find an action for uid {uid}, did you register it before the app was initialized?'
            ).with_traceback(e.__traceback__)

    @core_api_router.get('/download')
    async def get_download(code: str):   # pylint: disable=unused-variable
        path, file_name, cleanup_file, _ = get_by_code(code)

        def cleanup():
            if cleanup_file:
                os.remove(path)

        if os.path.exists(path):
            return FileResponse(
                path,
                headers={'Content-Disposition': f'attachment; filename={file_name}'},
                background=BackgroundTask(cleanup),
            )
        else:
            raise FileNotFoundError(f'Download file "{file_name}" could not be found at: {path}')

    @core_api_router.get('/config', dependencies=[Depends(verify_session)])
    async def get_config():  # pylint: disable=unused-variable
        return {
            **config.dict(
                include={'enable_devtools', 'live_reload', 'template', 'theme', 'title', 'context_components'}
            ),
            'application_name': get_settings().project_name,
        }

    @core_api_router.get('/auth-components')
    async def get_auth_components():  # pylint: disable=unused-variable
        return config.auth_config.component_config

    @core_api_router.get('/components', dependencies=[Depends(verify_session)])
    async def get_components():  # pylint: disable=unused-variable
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
        store: Store = utils_registry.get('Store')
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        comp = component_registry.get(component)

        if isinstance(comp, PyComponentDef):
            static_kwargs = static_kwargs_registry.get(body.uid)
            values = denormalize(body.values.data, body.values.lookup)

            response = await render_component(comp, store, task_mgr, values, static_kwargs)

            dev_logger.debug(f'PyComponent {comp.func.__name__}', 'return value', {'value': response})

            if isinstance(response, BaseTask):
                await task_mgr.run_task(response, body.ws_channel)
                return {'task_id': response.task_id}

            return response

        raise HTTPException(status_code=400, detail='Requesting this type of component is not supported')

    @core_api_router.get('/derived-variable/{uid}/latest', dependencies=[Depends(verify_session)])
    async def get_latest_derived_variable(uid: str):  # pylint: disable=unused-variable
        try:
            store: Store = utils_registry.get('Store')
            latest_value = latest_value_registry.get(uid)
            variable = derived_variable_registry.get(uid)

            registry_entry = get_cache_scope(variable.cache)

            if registry_entry in latest_value.cache_keys:
                value = store.get(latest_value.cache_keys[registry_entry], variable.cache)
                # If task is still running there is no latest value
                if isinstance(value, PendingTask):
                    return 'Pending...'
                dev_logger.debug(
                    f'DerivedVariable {variable.uid[:3]}..{variable.uid[-3:]}',
                    'latest value',
                    {'value': value, 'uid': uid},
                )
                return value
            return None

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
    ):   # pylint: disable=unused-variable
        try:
            store: Store = utils_registry.get('Store')
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            variable = data_variable_registry.get(uid)

            data = None

            if variable.type == 'derived':
                if body.cache_key is None:
                    raise HTTPException(status_code=400, detail='Cache key is required for derived data variables')

                if body.ws_channel is None:
                    raise HTTPException(
                        status_code=400, detail='Websocket channel is required for derived data variables'
                    )

                data = DerivedDataVariable.get_data(
                    variable,
                    body.cache_key,
                    store,
                    body.filters,
                    Pagination(offset=offset, limit=limit, orderBy=order_by),
                )
                if isinstance(data, BaseTask):
                    await task_mgr.run_task(data, body.ws_channel)
                    return {'task_id': data.task_id}
            elif variable.type == 'plain':
                data = DataVariable.get_value(
                    variable, store, body.filters, Pagination(offset=offset, limit=limit, orderBy=order_by)
                )

            dev_logger.debug(
                f'DataVariable {variable.uid[:3]}..{variable.uid[-3:]}',
                'return value',
                {'value': data.describe() if data is not None else None, 'uid': uid},  # type: ignore
            )

            if data is None:
                return None

            # Explicitly convert to JSON to avoid implicit serialization;
            # return as records as that makes more sense in a JSON structure
            return Response(df_to_json(data))   # type: ignore
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    class DataVariableCountRequestBody(BaseModel):
        cache_key: Optional[str]
        filters: Optional[FilterQuery]

    @core_api_router.post('/data-variable/{uid}/count', dependencies=[Depends(verify_session)])
    async def get_data_variable_count(uid: str, body: Optional[DataVariableCountRequestBody] = None):
        try:
            store: Store = utils_registry.get('Store')
            variable = data_variable_registry.get(uid)

            if variable.type == 'plain':
                return DataVariable.get_total_count(variable, store, body.filters if body is not None else None)

            if body is None or body.cache_key is None:
                raise HTTPException(
                    status_code=400, detail="Cache key is required when requesting DerivedDataVariable's count"
                )

            return DerivedDataVariable.get_total_count(variable, store, body.cache_key, body.filters)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @core_api_router.post('/data/upload', dependencies=[Depends(verify_session)])
    async def upload(
        data_uid: Optional[str] = None,
        data: UploadFile = File(),
        resolver_id: Optional[str] = Form(default=None),
    ):
        """
        Upload endpoint.
        Can run a custom resolver_id (if previously registered, otherwise runs a default one)
        and update a data variable with its return value (if target is specified).
        """
        if data_uid is None and resolver_id is None:
            raise HTTPException(400, 'Neither resolver_id or data_uid specified, at least one of them is required')

        try:
            store: Store = utils_registry.get('Store')
            variable = None

            if data.filename is None:
                raise HTTPException(status_code=400, detail='Filename not provided')

            _name, file_type = os.path.splitext(data.filename)

            if data_uid is not None:
                try:
                    variable = data_variable_registry.get(data_uid)
                except KeyError:
                    raise ValueError(f'Data Variable {data_uid} does not exist')

                if variable.type == 'derived':
                    raise HTTPException(status_code=400, detail='Cannot upload data to DerivedDataVariable')

            content = cast(bytes, await data.read())

            if resolver_id is not None:
                resolver = action_registry.get(resolver_id)
                content = resolver(content, data.filename)
            # If resolver is not provided, follow roughly the cl_dataset_parser logic
            elif file_type == '.xlsx':
                file_object_xlsx = io.BytesIO(content)
                content = pandas.read_excel(file_object_xlsx, index_col=None)
                content.columns = content.columns.str.replace('Unnamed: *', 'column_', regex=True)   # type: ignore
            else:
                # default to csv
                file_object_csv = io.StringIO(content.decode('utf-8'))
                content = pandas.read_csv(file_object_csv, index_col=0)
                content.columns = content.columns.str.replace('Unnamed: *', 'column_', regex=True)   # type: ignore

            # If a data variable is provided, update it with the new content
            if variable:
                DataVariable.update_value(variable, store, content)

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
        try:
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            store: Store = utils_registry.get('Store')
            variable = derived_variable_registry.get(uid)
            values = denormalize(body.values.data, body.values.lookup)

            if body.is_data_variable:
                # This should only be called by the frontend when requesting a data variable, as a first step to update the cached value
                result = await DerivedDataVariable.get_value(variable, store, task_mgr, values, body.force)
            else:
                result = await DerivedVariable.get_value(variable, store, task_mgr, values, body.force)

            response: Any = result

            if isinstance(result['value'], BaseTask):
                # Kick off the task
                await task_mgr.run_task(result['value'], body.ws_channel)
                response = {'task_id': result['value'].task_id, 'cache_key': result['cache_key']}

            dev_logger.debug(
                f'DerivedVariable {variable.uid[:3]}..{variable.uid[-3:]}',
                'return value',
                {'value': response, 'uid': uid},
            )

            # Return {cache_key: <cache_key>, value: <value>}
            return response
        except KeyError as err:
            raise ValueError(
                f'Could not find a derived variable for uid: {uid}, did you register it before the app '
                'was initialized?'
            ).with_traceback(err.__traceback__)

    @core_api_router.get('/tasks/{task_id}', dependencies=[Depends(verify_session)])
    async def get_task_result(task_id: str):   # pylint: disable=unused-variable
        try:
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            res = task_mgr.get_result(task_id)

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
