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
# ruff: noqa: F403, F405

from importlib.metadata import version

from pydantic import BaseModel

from dara.core.base_definitions import *
from dara.core.configuration import ConfigurationBuilder
from dara.core.css import CSSProperties, get_icon
from dara.core.definitions import *
from dara.core.interactivity import *
from dara.core.visual.components import Fallback
from dara.core.visual.dynamic_component import py_component
from dara.core.visual.progress_updater import ProgressUpdater, track_progress

__version__ = version('dara-core')


# Top-level imports for most commonly used APIs for ease of use

__all__ = [
    'action',
    'ActionCtx',
    'ConfigurationBuilder',
    'DerivedVariable',
    'DerivedDataVariable',
    'DataVariable',
    'ServerVariable',
    'UrlVariable',
    'Cache',
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
    'StyledComponentInstance',
    'ErrorHandlingConfig',
    'Fallback',
    'UpdateVariableImpl',
    'DownloadContentImpl',
    'NavigateToImpl',
]

for symbol in list(globals().values()):
    try:
        if issubclass(symbol, BaseModel) and symbol is not BaseModel:
            symbol.model_rebuild()
    except Exception as e:
        from dara.core.logging import dev_logger

        dev_logger.warning(f'Error rebuilding model "{symbol}": {e}')
