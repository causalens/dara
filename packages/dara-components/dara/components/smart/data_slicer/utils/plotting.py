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

from typing import cast

import numpy
from bokeh.plotting import figure
from pandas import DataFrame, Series
from scipy.stats import gaussian_kde

from dara.components.common import Stack, Text
from dara.components.plotting import Bokeh
from dara.components.smart.data_slicer.extension.data_slicer_filter import ColumnType
from dara.components.smart.data_slicer.utils.core import infer_column_type
from dara.core.definitions import discover

BLUE = '#3F9BF6'
BOKEH_STYLES = {'height': '200px'}


def _plot_x_numerical(dataset: DataFrame, x: str, **kwargs):
    color = BLUE
    df = dataset.copy()
    df = df[[x]].dropna()
    lin = numpy.linspace(df[x].min(), df[x].max(), 500)

    p = figure(
        title=f'Distribution - {x}',
        tools='',
        toolbar_location=None,
        sizing_mode='stretch_both',
        **kwargs,
    )
    p.toolbar.logo = None  # type: ignore

    pdf = gaussian_kde(cast(DataFrame, df[x]).dropna())
    y = pdf(lin)
    p.line(
        lin,
        y,
        alpha=0.6,
        line_color=color,
        line_width=3,
    )

    return p


def _plot_x_categorical(dataset: DataFrame, x: str, **kwargs):
    # clean infinities
    df = dataset.copy()
    df = df[[x]].dropna().astype(str)

    values_counts = cast(Series, df[x]).value_counts()

    p = figure(
        x_range=sorted(list(cast(Series, df[x]).unique())),
        title=f'Histogram - {x}',
        toolbar_location=None,
        tools='',
        sizing_mode='stretch_both',
        **kwargs,
    )

    p.vbar(x=values_counts.index, top=values_counts.values, width=0.5, color=BLUE)

    p.toolbar.logo = None  # type: ignore

    p.xgrid.grid_line_color = None

    return p


def _x_numerical(dataset: DataFrame, x: str):
    fig = _plot_x_numerical(dataset, x)
    if fig is None:
        return Stack(Text('Error rendering this part of the report.'), align='center')
    return Stack(Bokeh(fig, raw_css=BOKEH_STYLES), justify='center')


def _x_categorical(dataset: DataFrame, x: str):
    fig = _plot_x_categorical(dataset, x)
    if fig is None:
        return Stack(Text('Error rendering this part of the report.'), align='center')
    return Stack(Bokeh(fig, raw_css=BOKEH_STYLES), justify='center')


@discover
def render_input_plot(dataset: DataFrame, x: str):
    """
    Render an input plot for a given column of a dataset.

    :param dataset: input dataset
    :param x: column name
    """
    if x is None:
        return Stack(Text('Select variable to see the plot.'), align='center')

    column_type = infer_column_type(dataset, x)

    if column_type == ColumnType.CATEGORICAL:
        return _x_categorical(dataset, x)
    elif column_type == ColumnType.NUMERICAL:
        return _x_numerical(dataset, x)
    else:
        return Stack(Text('Datetime columns cannot be plotted'))
