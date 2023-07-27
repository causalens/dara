"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional, TypedDict

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
