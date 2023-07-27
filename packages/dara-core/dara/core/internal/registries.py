"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from datetime import datetime
from typing import Any, Callable, Mapping, Set

from dara.core.auth import BaseAuthConfig
from dara.core.base_definitions import ActionDef
from dara.core.defaults import CORE_ACTIONS, CORE_COMPONENTS, INITIAL_CORE_INTERNALS
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
from dara.core.internal.registry import Registry

action_def_registry = Registry[ActionDef]('Action Definition', CORE_ACTIONS)   # all registered actions
action_registry = Registry[Callable[..., Any]]('Action Handler')   # functions for actions requiring backend calls
component_registry = Registry[ComponentTypeAnnotation]('Components', CORE_COMPONENTS)
config_registry = Registry[EndpointConfiguration]('Endpoint Configuration')
data_variable_registry = Registry[DataVariableRegistryEntry]('DataVariable', allow_duplicates=False)
derived_variable_registry = Registry[DerivedVariableRegistryEntry]('DerivedVariable', allow_duplicates=False)
latest_value_registry = Registry[LatestValueRegistryEntry]('LatestValue', allow_duplicates=False)
template_registry = Registry[Template]('Template')
auth_registry = Registry[BaseAuthConfig]('Auth Config')
utils_registry = Registry[Any]('Utils', INITIAL_CORE_INTERNALS)
static_kwargs_registry = Registry[Mapping[str, Any]]('Static kwargs')

websocket_registry = Registry[str]('Websocket Channels')
"""maps session_id -> WS channel"""

sessions_registry = Registry[Set[str]]('User session')
"""maps user_identifier -> session_ids """

pending_tokens_registry = Registry[datetime]('Pending tokens')
"""map of token -> expiry, for tokens pending connection"""
