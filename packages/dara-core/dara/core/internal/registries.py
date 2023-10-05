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

from datetime import datetime
from typing import Any, Callable, Literal, Mapping, Set, Union

from dara.core.auth import BaseAuthConfig
from dara.core.base_definitions import ActionDef
from dara.core.defaults import CORE_ACTIONS, CORE_COMPONENTS, INITIAL_CORE_INTERNALS, INITIAL_HANDLERS, HandlerKeys, UtilsKeys
from dara.core.definitions import (
    ComponentTypeAnnotation,
    EndpointConfiguration,
    Template,
)
from dara.core.interactivity.data_variable import DataVariableRegistryEntry
from dara.core.interactivity.derived_variable import (
    DerivedVariableRegistryEntry,
    LatestValueRegistryEntry,
)
from dara.core.internal.registry import Registry, RegistryType
from dara.core.internal.websocket import CustomClientMessagePayload



action_def_registry = Registry[str, ActionDef](RegistryType.ACTION_DEF, CORE_ACTIONS)   # all registered actions
action_registry = Registry[str, Callable[..., Any]](RegistryType.ACTION)   # functions for actions requiring backend calls
upload_resolver_registry = Registry[str, Callable[..., Any]](
    RegistryType.UPLOAD_RESOLVER
)   # functions for upload resolvers requiring backend calls
component_registry = Registry[str, ComponentTypeAnnotation](RegistryType.COMPONENTS, CORE_COMPONENTS)
config_registry = Registry[str, EndpointConfiguration](RegistryType.ENDPOINT_CONFIG)
data_variable_registry = Registry[str, DataVariableRegistryEntry](RegistryType.DATA_VARIABLE, allow_duplicates=False)
derived_variable_registry = Registry[str, DerivedVariableRegistryEntry](
    RegistryType.DERIVED_VARIABLE, allow_duplicates=False
)
latest_value_registry = Registry[str, LatestValueRegistryEntry](RegistryType.LAST_VALUE, allow_duplicates=False)
template_registry = Registry[str, Template](RegistryType.TEMPLATE)

auth_registry = Registry[Literal['auth_config'], BaseAuthConfig](RegistryType.AUTH_CONFIG)
"""map of auth_config name -> auth_config class"""

utils_registry = Registry[UtilsKeys, Any](RegistryType.UTILS, INITIAL_CORE_INTERNALS)
"""map of util name -> util function"""

handlers_registry = Registry[HandlerKeys, Callable[..., Any]](RegistryType.HANDLERS, INITIAL_HANDLERS)
"""map of handler name -> handler function"""

static_kwargs_registry = Registry[str, Mapping[str, Any]](RegistryType.STATIC_KWARGS)
"""map of py_component instance uid -> static kwargs"""

websocket_registry = Registry[str, str](RegistryType.WEBSOCKET_CHANNELS)
"""maps session_id -> WS channel"""

sessions_registry = Registry[str, Set[str]](RegistryType.USER_SESSION)
"""maps user_identifier -> session_ids """

pending_tokens_registry = Registry[str, datetime](RegistryType.PENDING_TOKENS)
"""map of token -> expiry, for tokens pending connection"""

custom_ws_handlers_registry = Registry[str, Callable[[str, CustomClientMessagePayload], Any]](
    RegistryType.CUSTOM_WS_HANDLERS
)
"""map of custom kind name -> handler function(channel: str, message: CustomClientMessagePayload)"""
