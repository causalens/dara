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

from inspect import isclass
from typing import Optional, Union  # needed for model_rebuild # noqa: F401

from pydantic import BaseModel

from dara.core.definitions import BaseFallback  # needed for model_rebuild # noqa: F401
from dara.core.interactivity import Variable  # needed for model_rebuild # noqa: F401

from .dynamic_component import (
    DynamicComponent,
    DynamicComponentDef,
)
from .fallback import (
    DefaultFallbackDef,
    Fallback,
    RowFallbackDef,
)
from .for_cmp import For, ForDef
from .invalid_component import InvalidComponent
from .menu import Menu, MenuDef
from .powered_by_causalens import PoweredByCausalens, PoweredByCausalensDef
from .progress_tracker import (
    ProgressTracker,
    ProgressTrackerDef,
)
from .raw_string import RawString
from .router_content import RouterContent, RouterContentDef
from .sidebar_frame import SideBarFrame, SideBarFrameDef
from .theme_provider import ThemeProvider, ThemeProviderDef
from .topbar_frame import TopBarFrame, TopBarFrameDef

__all__ = [
    'DynamicComponent',
    'DynamicComponentDef',
    'InvalidComponent',
    'ProgressTracker',
    'ProgressTrackerDef',
    'Menu',
    'MenuDef',
    'For',
    'ForDef',
    'RawString',
    'RouterContent',
    'RouterContentDef',
    'SideBarFrame',
    'SideBarFrameDef',
    'TopBarFrame',
    'TopBarFrameDef',
    'DefaultFallbackDef',
    'RowFallbackDef',
    'Fallback',
    'PoweredByCausalens',
    'PoweredByCausalensDef',
    'ThemeProvider',
    'ThemeProviderDef',
]

for symbol in list(globals().values()) + [Fallback.Default, Fallback.Row]:
    try:
        if isclass(symbol) and issubclass(symbol, BaseModel) and symbol is not BaseModel:
            symbol.model_rebuild()
    except Exception as e:
        from dara.core.logging import dev_logger

        dev_logger.warning(f'Error rebuilding model "{symbol}": {e}')
