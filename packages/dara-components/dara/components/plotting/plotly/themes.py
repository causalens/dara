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
