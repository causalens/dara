"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from bokeh.models import CustomJS
from bokeh.plotting import figure


def figure_events(fig: figure):
    """
    Create an event generator for a particular figure.

    :param fig: The figure to generate events for
    """

    def define_event(event_name: str, code: str = 'return args'):
        """
        Define an event and provide JavaScript code to run when the event is called.
        The value returned by the javascript code is available as the first argument to any action

        :param event_name: The name of the event, this name should be unique
        :param
        """

        def generate_event(args: dict = {}):
            """
            Generate a CustomJS event with the code, event name and arguments provided

            :param args: The arguments to provide to the JS code
            """
            return CustomJS(
                args=args,
                code=f"""
                function {event_name.replace(' ','')+'__'+fig.id}(cb_obj, args) {{
                    {code}
                }}

                document.dispatchEvent(
                    new CustomEvent("BOKEH_FIGURE_{event_name}_{fig.id}", {{ detail: {event_name.replace(' ','')+'__'+fig.id}(cb_obj, {{{','.join(args.keys())}}}) }})
                )
                """,
            )

        return generate_event

    return define_event
