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

light_theme = {
    'attrs': {
        'Axis': {
            'axis_label_text_color': '#6A6D83',
            'axis_label_text_font': 'Manrope',
            'axis_label_text_font_size': '1em',
            'axis_label_text_font_style': 'italic',
            'axis_line_color': '#6A6D83',
            'major_label_text_color': '#6A6D83',
            'major_label_text_font': 'Manrope',
            'major_label_text_font_size': '0.875em',
            'major_tick_line_color': '#6A6D83',
            'minor_tick_line_color': '#6A6D83',
        },
        'figure': {
            'background_fill_color': 'rgba(255,255,255,0)',
            'border_fill_color': 'rgba(255,255,255,0)',
            'min_border_bottom': 20,
            'min_border_left': 20,
            'min_border_right': 20,
            'min_border_top': 20,
        },
        'Grid': {'grid_line_alpha': 0.5},
        'Title': {
            'text_color': '#6A6D83',
            'text_font': 'Manrope',
            'text_font_size': '1em',
            'text_font_style': 'bold',
        },
    }
}

dark_theme = {
    'attrs': {
        'figure': {
            'background_fill_color': 'rgba(255,255,255,0)',
            'border_fill_color': 'rgba(255,255,255,0)',
            'outline_line_color': '#E0E0E0',
            'outline_line_alpha': 0.25,
            'min_border_bottom': 20,
            'min_border_left': 20,
            'min_border_right': 20,
            'min_border_top': 20,
        },
        'Grid': {'grid_line_color': '#E0E0E0', 'grid_line_alpha': 0.25},
        'Axis': {
            'major_tick_line_alpha': 0,
            'major_tick_line_color': '#E0E0E0',
            'minor_tick_line_alpha': 0,
            'minor_tick_line_color': '#E0E0E0',
            'axis_line_alpha': 0,
            'axis_line_color': '#E0E0E0',
            'major_label_text_color': '#E0E0E0',
            'major_label_text_font': 'Manrope',
            'major_label_text_font_size': '0.875em',
            'axis_label_standoff': 10,
            'axis_label_text_color': '#E0E0E0',
            'axis_label_text_font': 'Manrope',
            'axis_label_text_font_size': '1em',
            'axis_label_text_font_style': 'normal',
        },
        'Legend': {
            'spacing': 8,
            'glyph_width': 15,
            'label_standoff': 8,
            'label_text_color': '#E0E0E0',
            'label_text_font': 'Manrope',
            'label_text_font_size': '0.875em',
            'border_line_alpha': 0,
            'background_fill_alpha': 0.25,
            'background_fill_color': '#20262B',
        },
        'ColorBar': {
            'title_text_color': '#E0E0E0',
            'title_text_font': 'Manrope',
            'title_text_font_size': '0.875em',
            'title_text_font_style': 'normal',
            'major_label_text_color': '#E0E0E0',
            'major_label_text_font': 'Manrope',
            'major_label_text_font_size': '0.875em',
            'background_fill_color': '#15191C',
            'major_tick_line_alpha': 0,
            'bar_line_alpha': 0,
        },
        'Title': {'text_color': '#E0E0E0', 'text_font': 'Manrope', 'text_font_size': '1em'},
    }
}
