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

from enum import Enum
from typing import Any, List, Optional

import plotly.graph_objects as go
import plotly.io as pio
from pydantic import ConfigDict

from dara.components.plotting.plotly.themes import light_theme
from dara.core.base_definitions import Action
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.definitions import StyledComponentInstance

SETTINGS = {'THEME': light_theme}

# We need to set the default theme for plotly so that plotly express when setting traces is able to pick up dara theme colors
base_template = pio.templates['plotly']
dara_theme = base_template.layout.update(SETTINGS['THEME']['layout'])  # type: ignore
dara_template = go.layout.Template(layout=dara_theme)
# Set the default theme for plotly
pio.templates['dara_theme'] = dara_template
pio.templates.default = 'dara_theme'


class PlotlyEventName(str, Enum):
    """
    Enum containing Plotly.js event names available for use in the Plotly component.
    """

    AFTER_EXPORT = 'plotly_afterexport'
    AFTER_PLOT = 'plotly_afterplot'
    ANIMATED = 'plotly_animated'
    ANIMATING_FRAME = 'plotly_animatingframe'
    ANIMATION_INTERRUPTED = 'plotly_animationinterrupted'
    AUTO_SIZE = 'plotly_autosize'
    BEFORE_EXPORT = 'plotly_beforeexport'
    BEFORE_HOVER = 'plotly_beforehover'
    BUTTON_CLICKED = 'plotly_buttonclicked'
    CLICK = 'plotly_click'
    CLICK_ANNOTATION = 'plotly_clickannotation'
    DESELECT = 'plotly_deselect'
    DOUBLE_CLICK = 'plotly_doubleclick'
    FRAMEWORK = 'plotly_framework'
    HOVER = 'plotly_hover'
    LEGEND_CLICK = 'plotly_legendclick'
    LEGEND_DOUBLE_CLICK = 'plotly_legenddoubleclick'
    REDRAW = 'plotly_redraw'
    RELAYOUT = 'plotly_relayout'
    RESTYLE = 'plotly_restyle'
    SELECTED = 'plotly_selected'
    SELECTING = 'plotly_selecting'
    SLIDER_CHANGE = 'plotly_sliderchange'
    SLIDER_END = 'plotly_sliderend'
    SLIDER_START = 'plotly_sliderstart'
    TRANSITION_INTERRUPTED = 'plotly_transitioninterrupted'
    TRANSITIONING = 'plotly_transitioning'
    UNHOVER = 'plotly_unhover'
    WEBGL_CONTEXT_LOST = 'plotly_webglcontextlost'


class PlotlyEvent(BaseModel):
    """
    A Plotly Event type for adding plotly.js events to a plotly figure.
    """

    event_name: PlotlyEventName
    actions: Optional[List[Action]] = None
    custom_js: Optional[str] = None


class Plotly(StyledComponentInstance):
    """
    A Plotly Component allows for a plotly figure to be added to your app. Accepts a plotly figure as a parameter and an array of events.
    The component takes care of serialization of the component using plotly's to_json helper. This in rendered and handled in the frontend with Plotly's react component.

    By default the Plotly plot will have a minimum height of 350px and grow to fit the space available to it.
    This default minimum height can be changed by passing `min_height` prop to the component:

    ```python
    from dara.core import ConfigurationBuilder
    from dara.components import Plotly
    import plotly.express as px

    df = px.data.iris()  # Using built-in Iris dataset
    fig = px.scatter(df, x='sepal_width', y='sepal_length', color='species', title='Iris Dataset Scatter Plot')


    def plotly_page():
        return Plotly(figure=fig, min_height=100)


    config = ConfigurationBuilder()
    config.add_page(name='MyPlot', content=plotly_page())
    ```

    :param figure: A plotly figure
    :param events: An array of plotly events
    """

    js_module = '@darajs/components'

    figure: str
    events: Optional[List[PlotlyEvent]] = None

    EventName = PlotlyEventName
    Event = PlotlyEvent

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        use_enum_values=True,
    )

    def __init__(
        self,
        figure: Any = None,
        theme: Optional[dict] = None,
        events: Optional[List[PlotlyEvent]] = None,
        **kwargs,
    ):
        if theme is None and figure is not None:
            figure.update_layout(template=theme if theme is not None else SETTINGS['THEME'])

        figure_dict = figure.to_json()

        super().__init__(figure=figure_dict, events=events, **kwargs)


def set_default_plotly_theme(theme: dict):
    SETTINGS['THEME'] = theme
