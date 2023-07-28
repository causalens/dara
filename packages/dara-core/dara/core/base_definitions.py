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

from __future__ import annotations

# This file should be used for an definitions that have no deps at all so that they can always be imported and shared
# between other parts of the framework
import abc
import uuid
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, ClassVar, List, Optional, Union

import anyio
from anyio.streams.memory import MemoryObjectSendStream
from pydantic import BaseModel

if TYPE_CHECKING:
    from dara.core.interactivity.actions import ActionContextType
    from dara.core.internal.store import Store


class DaraBaseModel(BaseModel):
    """
    Custom BaseModel which handles TemplateMarkers.
    If TemplateMarkers are present, validation is skipped.
    """

    class Config:
        smart_union = True
        extra = 'forbid'

    def __init__(self, *args, **kwargs):
        has_template_var_marker = any(isinstance(arg, TemplateMarker) for arg in args) or any(
            isinstance(value, TemplateMarker) for value in kwargs.values()
        )

        if has_template_var_marker:
            # Imitate pydantic's BaseModel.__init__ but avoid validation
            values = {}
            fields_set = set()
            _missing = object()

            for name, field in self.__class__.__fields__.items():
                value = kwargs.get(field.alias, _missing)
                if value is _missing:
                    value = field.get_default()
                else:
                    fields_set.add(name)
                values[name] = value

            object.__setattr__(self, '__dict__', values)
            object.__setattr__(self, '__fields_set__', fields_set)
            self._init_private_attributes()
        else:
            super().__init__(*args, **kwargs)


class CacheType(str, Enum):
    """Cache types enum"""

    GLOBAL = 'global'
    SESSION = 'session'
    USER = 'user'


class BaseTaskMessage(BaseModel):
    task_id: str


class TaskProgressUpdate(BaseTaskMessage):
    progress: float
    message: str


class TaskResult(BaseTaskMessage):
    result: Any
    cache_key: Optional[str]
    cache_type: Optional[CacheType]


class TaskError(BaseTaskMessage):
    error: BaseException
    cache_key: Optional[str]
    cache_type: Optional[CacheType]

    class Config:
        arbitrary_types_allowed = True


TaskMessage = Union[TaskProgressUpdate, TaskResult, TaskError]


class BaseTask(abc.ABC):
    """
    Generic BaseTask that can be used for type checking tasks
    """

    cache_key: Optional[str]
    cache_type: Optional[CacheType]
    notify_channels: List[str]
    task_id: str

    @abc.abstractmethod
    def __init__(self, task_id: Optional[str] = None) -> None:
        self.task_id = str(uuid.uuid4()) if task_id is None else task_id
        super().__init__()

    @abc.abstractmethod
    async def run(self, send_stream: Optional[MemoryObjectSendStream[TaskMessage]] = None) -> Any:
        ...

    @abc.abstractmethod
    async def cancel(self):
        ...


class PendingTask(BaseTask):
    """
    Represents a running pending task.
    Is associated to an underlying task definition.
    """

    def __init__(self, task_id: str, task_def: BaseTask, ws_channel: Optional[str] = None):
        self.task_id = task_id
        self.task_def = task_def
        self.notify_channels = [ws_channel] if ws_channel else []

        self.cancel_scope: Optional[anyio.CancelScope] = None
        self.event = anyio.Event()
        self.result: Optional[Any] = None
        self.error: Optional[BaseException] = None
        self.subscribers = 1

    async def run(self, send_stream: Optional[MemoryObjectSendStream[TaskMessage]] = None):
        """
        Wait for the task to complete
        """
        # Waiting in chunks as otherwise Jupyter blocks the event loop
        while not self.event.is_set():
            await anyio.sleep(0.01)

        if self.error:
            raise self.error

        return self.result

    def resolve(self, value: Any):
        """
        Resolve the pending state and send values to the waiting code

        :param value: the value to resolve as the result
        """
        self.result = value
        self.event.set()

    def fail(self, exc: BaseException):
        """
        Resolve the pending state with an error and send it to the waiting code

        :param exc: exception to resolve as the result
        """
        self.error = exc
        self.event.set()

    async def cancel(self):
        """
        Stop the task
        """
        if self.cancel_scope:
            self.cancel_scope.cancel()
        await self.task_def.cancel()

        self.error = Exception('Task was cancelled')
        self.event.set()

    def add_subscriber(self):
        """
        Add 1 to the subscriber count
        """
        self.subscribers += 1

    def remove_subscriber(self):
        """
        Remove 1 from the subscriber count
        """
        self.subscribers -= 1


class ActionDef(BaseModel):
    """
    Action definition required to register actions in the app

    :param name: name of the action, must match the Python definition and JS implementation
    :param py_module: name of the PY module with action definition, used for versioning
    :param js_module: JS module where the action implementation lives.
    Not required for local actions as they are located via dara.config.json
    """

    name: str
    py_module: str
    js_module: Optional[str]


class ActionInstance(DaraBaseModel):
    """
    Base class for actions

    :param uid: unique action indentifier
    :param js_module: JS module including the implementation of the action.
    Required for non-local actions.
    """

    uid: Optional[str] = None
    js_module: ClassVar[Optional[str]] = None

    # TODO: if there is a need, this could also support required_routes just like ComponentInstance

    def __init__(self, *args, **kwargs):
        uid = kwargs.pop('uid', None)
        if uid is None:
            uid = str(uuid.uuid4())
        super().__init__(uid=uid, *args, **kwargs)

    def dict(self, *args, **kwargs):
        props = super().dict(*args, **kwargs)
        props.pop('uid')
        return {'name': type(self).__name__, **props, 'uid': self.uid}

    def register_resolver(self, uid: str, resolver: Callable[[ActionContextType], Any]):
        """
        Registers the action resolver to the registry

        :param uid: unique action indentifier
        :param resolver: action resolver for which context will be passed to
        """
        from dara.core.internal.registries import action_registry

        action_registry.register(uid, resolver)


Action = Union[ActionInstance, List[ActionInstance]]


class ComponentType(Enum):
    """Component types enum"""

    JS = 'js'
    PY = 'py'


class TemplateMarker(BaseModel):
    """
    Template marker used to mark fields that should be replaced with a data field on the client before being rendered.
    See dara_core.definitions.template for details
    """

    field_name: str

    def dict(self, *args, **kwargs):
        dict_form = super().dict(*args, **kwargs)
        dict_form['__typename'] = 'TemplateMarker'
        return dict_form
