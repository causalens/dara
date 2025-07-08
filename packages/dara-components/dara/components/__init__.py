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
# ruff: noqa: F401, F403

from importlib.metadata import version

from pydantic import BaseModel

from dara.components.common import *
from dara.components.graphs import *
from dara.components.plotting import *
from dara.components.smart import *

# NOTE: apparently this is required for model_rebuild to work, otherwise
# the rebuild silently fails and the components only accept ComponentInstance fields
from dara.core.interactivity import Variable

__version__ = version('dara-components')

for symbol in list(globals().values()):
    try:
        if issubclass(symbol, BaseModel) and symbol is not BaseModel:
            symbol.model_rebuild()
    except Exception as e:
        from dara.core.logging import dev_logger

        dev_logger.warning(f'Error rebuilding model "{symbol}": {e}')
