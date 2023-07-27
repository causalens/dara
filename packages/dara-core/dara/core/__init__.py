"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from __future__ import annotations
from importlib.metadata import version

from dara.core.base_definitions import CacheType
from dara.core.configuration import ConfigurationBuilder
from dara.core.css import CSSProperties, get_icon
from dara.core.definitions import ComponentInstance, ErrorHandlingConfig, template
from dara.core.interactivity import (
    DataVariable,
    DerivedDataVariable,
    DerivedVariable,
    DownloadContent,
    DownloadVariable,
    NavigateTo,
    Notify,
    ResetVariables,
    SideEffect,
    TriggerVariable,
    UpdateVariable,
    UrlVariable,
    Variable,
)
from dara.core.visual.components import Fallback, For
from dara.core.visual.dynamic_component import py_component
from dara.core.visual.progress_updater import ProgressUpdater, track_progress

__version__ = version('dara-core')

# Top-level imports for most commonly used APIs for ease of use

__all__ = [
    'ConfigurationBuilder',
    'DerivedVariable',
    'DerivedDataVariable',
    'DataVariable',
    'UrlVariable',
    'CacheType',
    'Variable',
    'py_component',
    'DownloadVariable',
    'DownloadContent',
    'NavigateTo',
    'Notify',
    'ResetVariables',
    'SideEffect',
    'TriggerVariable',
    'UpdateVariable',
    'get_icon',
    'CSSProperties',
    'ProgressUpdater',
    'track_progress',
    'ComponentInstance',
    'ErrorHandlingConfig',
    'template',
    'For',
    'Fallback',
]
