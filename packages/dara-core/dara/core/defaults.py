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

from typing import Any, Dict, Literal

from dara.core.base_definitions import ActionDef
from dara.core.configuration import Configuration
from dara.core.definitions import ComponentTypeAnnotation, Template
from dara.core.interactivity.actions import (
    DownloadContent,
    DownloadContentDef,
    DownloadVariable,
    DownloadVariableDef,
    Logout,
    LogoutDef,
    NavigateTo,
    NavigateToDef,
    Notify,
    NotifyDef,
    ResetVariables,
    ResetVariablesDef,
    SideEffect,
    SideEffectDef,
    TriggerVariable,
    TriggerVariableDef,
    UpdateVariable,
    UpdateVariableDef,
)
from dara.core.interactivity.any_data_variable import upload
from dara.core.interactivity.any_variable import get_current_value
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.internal.execute_action import execute_action
from dara.core.internal.cache_store import CacheStore
from dara.core.visual.components import (
    DefaultFallbackDef,
    DynamicComponent,
    DynamicComponentDef,
    Fallback,
    For,
    ForDef,
    Menu,
    MenuDef,
    ProgressTracker,
    ProgressTrackerDef,
    RouterContent,
    RouterContentDef,
    RowFallbackDef,
    SideBarFrame,
    SideBarFrameDef,
    TopBarFrame,
    TopBarFrameDef,
)
from dara.core.visual.dynamic_component import render_component
from dara.core.visual.template import TemplateBuilder

# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #
# This file defines the defaults for the dara_core platform #
# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #

# Store needs to exist earlier
_store = CacheStore()

UtilsKeys = Literal[
    'Store', 'RegistryLookup', 'TaskGroup', 'WebsocketManager', 'TaskManager', 'TaskPool',
]
INITIAL_CORE_INTERNALS: Dict[UtilsKeys, Any] = {'Store': _store, 'RegistryLookup': None, 'TaskGroup': None, 'WebsocketManager': None, 'TaskManager': None, 'TaskPool': None,}

HandlerKeys = Literal[
    'execute_action', 'upload', 'render_component', 'get_current_value', 'DataVariable.get_value', 'DataVariable.get_total_count', 'DerivedVariable.get_value', 'DerivedDataVariable.get_data', 'DerivedDataVariable.get_value', 'DerivedDataVariable.get_total_count'
]
INITIAL_HANDLERS: Dict[HandlerKeys, Any] = {
    'execute_action': execute_action,
    'upload': upload,
    'render_component': render_component,
    'get_current_value': get_current_value,
    'DataVariable.get_value': DataVariable.get_value,
    'DataVariable.get_total_count': DataVariable.get_total_count,
    'DerivedVariable.get_value': DerivedVariable.get_value,
    'DerivedDataVariable.get_data': DerivedDataVariable.get_data,
    'DerivedDataVariable.get_value': DerivedDataVariable.get_value,
    'DerivedDataVariable.get_total_count': DerivedDataVariable.get_total_count,
}
"""This stores the core internal functions that are used by dara.core. Can be overriden to swap out the implementation"""

# These components are provided by the core JS of this module
CORE_COMPONENTS: Dict[str, ComponentTypeAnnotation] = {
    DynamicComponent.__name__: DynamicComponentDef,
    Menu.__name__: MenuDef,
    ProgressTracker.__name__: ProgressTrackerDef,
    RouterContent.__name__: RouterContentDef,
    SideBarFrame.__name__: SideBarFrameDef,
    TopBarFrame.__name__: TopBarFrameDef,
    Fallback.Default.py_component: DefaultFallbackDef,
    Fallback.Row.py_component: RowFallbackDef,
    For.__name__: ForDef,
}

# These actions are provided by the core JS of this module
CORE_ACTIONS: Dict[str, ActionDef] = {
    NavigateTo.__name__: NavigateToDef,
    UpdateVariable.__name__: UpdateVariableDef,
    TriggerVariable.__name__: TriggerVariableDef,
    SideEffect.__name__: SideEffectDef,
    ResetVariables.__name__: ResetVariablesDef,
    DownloadVariable.__name__: DownloadVariableDef,
    DownloadContent.__name__: DownloadContentDef,
    Notify.__name__: NotifyDef,
    Logout.__name__: LogoutDef,
}

# Define a default layout template
def default_template(config: Configuration) -> Template:

    template = TemplateBuilder(name='default')

    router = template.add_router_from_pages(list(config.pages.values()))

    template.layout = SideBarFrame(content=RouterContent(routes=router.content), side_bar=Menu(routes=router.links))

    return template.to_template()


# Define a blank template
def blank_template(config: Configuration) -> Template:

    template = TemplateBuilder(name='default')

    router = template.add_router_from_pages(list(config.pages.values()))

    template.layout = RouterContent(routes=router.content)

    return template.to_template()


# Define a top layout template
def top_template(config: Configuration) -> Template:

    template = TemplateBuilder(name='default')

    router = template.add_router_from_pages(list(config.pages.values()))

    template.layout = TopBarFrame(content=RouterContent(routes=router.content))

    return template.to_template()


# Define a top layout template with menu
def top_menu_template(config: Configuration) -> Template:

    template = TemplateBuilder(name='default')

    router = template.add_router_from_pages(list(config.pages.values()))

    template.layout = TopBarFrame(content=RouterContent(routes=router.content), top_bar=Menu(routes=router.links))

    return template.to_template()
