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

from typing import Optional

from typing_extensions import TypedDict

from dara.core.base_definitions import Action
from dara.core.definitions import AnyVariable, ComponentInstance


class FilterStats(TypedDict):
    # number of all rows in dataset
    max_rows: int
    # number of filtered rows
    current_rows: int
    # number of active filters
    active_filters: int


class FilterStatusButton(ComponentInstance):
    """
    Filter Status Button component.

    :param filter_stats: current filter stats
    :param on_click: click handler
    :param top_position: optional property to override the absolute 'top' property
    """

    js_module = '@darajs/components'

    filter_stats: AnyVariable
    on_click: Action
    top_position: Optional[str] = '5%'
