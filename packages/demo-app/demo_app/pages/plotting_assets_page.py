import plotly.graph_objects as go
from bokeh.plotting import figure

from dara.components import Bokeh, Card, Heading, Plotly, Stack
from dara.core import ComponentInstance


def get_bokeh_figure():
    plot = figure(
        height=350,
        sizing_mode='stretch_width',
        title='Bokeh Browser Asset QA',
        x_axis_label='Month',
        y_axis_label='Value',
    )
    plot.line([1, 2, 3, 4, 5], [4, 7, 6, 9, 12], line_width=3, color='#3b82f6', legend_label='forecast')
    plot.scatter([1, 2, 3, 4, 5], [3, 5, 8, 8, 11], size=10, color='#f97316', legend_label='actual')
    plot.legend.location = 'top_left'
    return plot


def get_plotly_figure():
    fig = go.Figure()
    fig.add_trace(go.Bar(x=['Core', 'Components', 'Graphs', 'Docs'], y=[18, 26, 14, 9], name='alerts'))
    fig.add_trace(go.Scatter(x=['Core', 'Components', 'Graphs', 'Docs'], y=[12, 18, 10, 7], name='patched'))
    fig.update_layout(
        title='Plotly Browser Asset QA',
        xaxis_title='Package area',
        yaxis_title='Count',
        margin={'l': 48, 'r': 24, 't': 56, 'b': 48},
    )
    return fig


def plotting_assets_page() -> ComponentInstance:
    return Stack(
        Heading('Plotting Assets QA'),
        Card(Bokeh(get_bokeh_figure()), title='Bokeh'),
        Card(Plotly(get_plotly_figure(), min_height=350), title='Plotly'),
    )
