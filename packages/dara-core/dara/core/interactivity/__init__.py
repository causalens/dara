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

from dara.core.interactivity.actions import (
    ActionContext,
    ActionInputs,
    DownloadContent,
    DownloadVariable,
    NavigateTo,
    Notify,
    ResetVariables,
    SideEffect,
    TriggerVariable,
    UpdateVariable,
)
from dara.core.interactivity.any_data_variable import AnyDataVariable
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.condition import Condition, Operator
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.non_data_variable import NonDataVariable
from dara.core.interactivity.plain_variable import Variable
from dara.core.interactivity.url_variable import UrlVariable

# Update references to variable types in these actions
refs = {
    'AnyDataVariable': AnyDataVariable,
    'DerivedVariable': DerivedVariable,
    'Variable': Variable,
    'AnyVariable': AnyVariable,
    'DataVariable': DataVariable,
    'UrlVariable': UrlVariable,
}
DownloadVariable.update_forward_refs(**refs)
DownloadContent.update_forward_refs(**refs)
NavigateTo.update_forward_refs(**refs)
ResetVariables.update_forward_refs(**refs)
SideEffect.update_forward_refs(**refs)
TriggerVariable.update_forward_refs(**refs)
UpdateVariable.update_forward_refs(**refs)
Condition.update_forward_refs(**refs)
ActionContext.update_forward_refs(**refs)
Notify.update_forward_refs(**refs)


__all__ = [
    'ActionContext',
    'ActionInputs',
    'AnyVariable',
    'AnyDataVariable',
    'DataVariable',
    'NonDataVariable',
    'Variable',
    'DerivedVariable',
    'DerivedDataVariable',
    'UrlVariable',
    'DownloadVariable',
    'DownloadContent',
    'NavigateTo',
    'Notify',
    'ResetVariables',
    'SideEffect',
    'TriggerVariable',
    'UpdateVariable',
    'Condition',
    'Operator',
]
