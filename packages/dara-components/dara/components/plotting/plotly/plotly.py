"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from enum import Enum
from typing import Any, List, Optional

import plotly.graph_objects as go
from pydantic import BaseModel

from dara.components.plotting.plotly.themes import light_theme
from dara.core.base_definitions import Action
from dara.core.definitions import StyledComponentInstance

SETTINGS = {'THEME': light_theme}


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

    :param figure: A plotly figure
    :param events: An array of plotly events
    """

    js_module = '@darajs/components'

    figure: str
    events: Optional[List[PlotlyEvent]] = None

    EventName = PlotlyEventName
    Event = PlotlyEvent

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {go.Figure: lambda v: v.to_json()}
        use_enum_values = True

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
