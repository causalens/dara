"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

import numpy
from bokeh.plotting import figure
from pandas import DataFrame
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
    p.toolbar.logo = None   # type: ignore

    pdf = gaussian_kde(df[x].dropna())
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

    values_counts = df[x].value_counts()

    p = figure(
        x_range=sorted(list(df[x].unique())),
        title=f'Histogram - {x}',
        toolbar_location=None,
        tools='',
        sizing_mode='stretch_both',
        **kwargs,
    )

    p.vbar(x=values_counts.index, top=values_counts.values, width=0.5, color=BLUE)

    p.toolbar.logo = None   # type: ignore

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
