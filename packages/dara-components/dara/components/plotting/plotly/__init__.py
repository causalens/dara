"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from dara.components.plotting.plotly.plotly import Plotly, set_default_plotly_theme
from dara.components.plotting.plotly.themes import dark_theme, light_theme

__all__ = [
    'Plotly',
    'set_default_plotly_theme',
    'dark_theme',
    'light_theme',
]
