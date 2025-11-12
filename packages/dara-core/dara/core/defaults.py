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

from typing import TYPE_CHECKING, cast

from dara.core.base_definitions import ActionDef
from dara.core.interactivity.actions import (
    CopyToClipboard,
    CopyToClipboardDef,
    DownloadContentDef,
    DownloadVariable,
    DownloadVariableDef,
    NavigateToDef,
    Notify,
    NotifyDef,
    ResetVariables,
    ResetVariablesDef,
    TriggerVariable,
    TriggerVariableDef,
    UpdateVariableDef,
)
from dara.core.internal.cache_store import CacheStore
from dara.core.router import Link, LinkDef, MenuLink, MenuLinkDef, Navigate, NavigateDef, Outlet, OutletDef
from dara.core.visual.components import (
    DefaultFallbackDef,
    DynamicComponent,
    DynamicComponentDef,
    Fallback,
    For,
    ForDef,
    Match,
    MatchDef,
    Menu,
    MenuDef,
    PoweredByCausalens,
    PoweredByCausalensDef,
    ProgressTracker,
    ProgressTrackerDef,
    RouterContent,
    RouterContentDef,
    RowFallbackDef,
    SideBarFrame,
    SideBarFrameDef,
    ThemeProvider,
    ThemeProviderDef,
    TopBarFrame,
    TopBarFrameDef,
)
from dara.core.visual.components.fallback import CustomFallbackDef
from dara.core.visual.template import TemplateBuilder

if TYPE_CHECKING:
    from dara.core.configuration import Configuration
    from dara.core.definitions import ComponentTypeAnnotation, Template

# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #
# This file defines the defaults for the dara_core platform #
# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #

# Store needs to exist earlier
_store = CacheStore()

INITIAL_CORE_INTERNALS = {'Store': _store}


# These components are provided by the core JS of this module
CORE_COMPONENTS: dict[str, ComponentTypeAnnotation] = {
    DynamicComponent.__name__: DynamicComponentDef,
    Menu.__name__: MenuDef,
    MenuLink.__name__: MenuLinkDef,
    ProgressTracker.__name__: ProgressTrackerDef,
    RouterContent.__name__: RouterContentDef,
    SideBarFrame.__name__: SideBarFrameDef,
    TopBarFrame.__name__: TopBarFrameDef,
    cast(str, Fallback.Default.py_component): DefaultFallbackDef,
    cast(str, Fallback.Row.py_component): RowFallbackDef,
    cast(str, Fallback.Custom.py_component): CustomFallbackDef,
    Match.__name__: MatchDef,
    For.__name__: ForDef,
    Link.__name__: LinkDef,
    Outlet.__name__: OutletDef,
    Navigate.__name__: NavigateDef,
    PoweredByCausalens.__name__: PoweredByCausalensDef,
    ThemeProvider.__name__: ThemeProviderDef,
}

# These actions are provided by the core JS of this module
CORE_ACTIONS: dict[str, ActionDef] = {
    'NavigateTo': NavigateToDef,
    'UpdateVariable': UpdateVariableDef,
    TriggerVariable.__name__: TriggerVariableDef,
    ResetVariables.__name__: ResetVariablesDef,
    DownloadVariable.__name__: DownloadVariableDef,
    CopyToClipboard.__name__: CopyToClipboardDef,
    'DownloadContent': DownloadContentDef,
    Notify.__name__: NotifyDef,
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
