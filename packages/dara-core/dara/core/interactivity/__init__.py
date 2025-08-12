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

from pydantic import BaseModel

from dara.core.interactivity.actions import (
    ActionCtx,
    DownloadContent,
    DownloadContentImpl,
    DownloadVariable,
    NavigateTo,
    NavigateToImpl,
    Notify,
    ResetVariables,
    SideEffect,
    TriggerVariable,
    UpdateVariable,
    UpdateVariableImpl,
    action,
)
from dara.core.interactivity.any_data_variable import AnyDataVariable
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.client_variable import ClientVariable
from dara.core.interactivity.condition import Condition, Operator
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.non_data_variable import NonDataVariable
from dara.core.interactivity.plain_variable import Variable
from dara.core.interactivity.server_variable import ServerVariable
from dara.core.interactivity.state_variable import StateVariable
from dara.core.interactivity.switch_variable import SwitchVariable
from dara.core.interactivity.url_variable import UrlVariable

__all__ = [
    'action',
    'ActionCtx',
    'AnyVariable',
    'AnyDataVariable',
    'ClientVariable',
    'DataVariable',
    'NonDataVariable',
    'Variable',
    'StateVariable',
    'SwitchVariable',
    'DerivedVariable',
    'DerivedDataVariable',
    'UrlVariable',
    'DownloadVariable',
    'DownloadContent',
    'DownloadContentImpl',
    'NavigateTo',
    'NavigateToImpl',
    'Notify',
    'ResetVariables',
    'TriggerVariable',
    'UpdateVariable',
    'UpdateVariableImpl',
    'ServerVariable',
    'SideEffect',
    'Condition',
    'Operator',
]

for symbol in list(globals().values()):
    try:
        if issubclass(symbol, BaseModel) and symbol is not BaseModel:
            symbol.model_rebuild()
    except Exception as e:
        from dara.core.logging import dev_logger

        dev_logger.warning(f'Error rebuilding model "{symbol}": {e}')
