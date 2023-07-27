"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from dara.components.plotting.palettes import CategoricalDark10, CategoricalLight10
from dara.core.visual.themes import dark, light

light_colors = light.Light.colors
dark_colors = dark.Dark.colors

light_theme = {
    'layout': {
        'paper_bgcolor': light_colors.blue1,  # Set the background color of the plot
        'plot_bgcolor': light_colors.blue1,  # Set the background color of the plot area
        'colorway': CategoricalLight10,
        'font': {
            'family': 'Manrope',
            'size': 16,
            'color': light_colors.text,
        },
        'xaxis': {
            'gridcolor': light_colors.grey2,
        },
        'yaxis': {
            'gridcolor': light_colors.grey2,
        },
    }
}

dark_theme = {
    'layout': {
        'paper_bgcolor': dark_colors.blue1,  # Set the background color of the plot
        'plot_bgcolor': dark_colors.blue1,  # Set the background color of the plot area
        'colorway': CategoricalDark10,
        'font': {
            'family': 'Manrope',
            'size': 16,
            'color': dark_colors.text,
        },
        'xaxis': {
            'gridcolor': dark_colors.grey2,
        },
        'yaxis': {
            'gridcolor': dark_colors.grey2,
        },
    }
}
