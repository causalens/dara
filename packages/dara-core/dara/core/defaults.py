"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from __future__ import annotations

from typing import Dict

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
from dara.core.internal.store import Store
from dara.core.visual.components import (
    DefaultFallbackDef,
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
from dara.core.visual.template import TemplateBuilder

# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #
# This file defines the defaults for the dara_core platform #
# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #

# Store needs to exist earlier
_store = Store()

INITIAL_CORE_INTERNALS = {'Store': _store}


# These components are provided by the core JS of this module
CORE_COMPONENTS: Dict[str, ComponentTypeAnnotation] = {
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
