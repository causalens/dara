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

from typing import Union

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

        def generate_event(args: Union[dict, None] = None):
            """
            Generate a CustomJS event with the code, event name and arguments provided

            :param args: The arguments to provide to the JS code
            """
            if args is None:
                args = {}
            return CustomJS(
                args=args,
                code=f"""
                function {event_name.replace(' ', '') + '__' + fig.id}(cb_obj, args) {{
                    {code}
                }}

                document.dispatchEvent(
                    new CustomEvent("BOKEH_FIGURE_{event_name}_{fig.id}", {{ detail: {event_name.replace(' ', '') + '__' + fig.id}(cb_obj, {{{','.join(args.keys())}}}) }})
                )
                """,
            )

        return generate_event

    return define_event
