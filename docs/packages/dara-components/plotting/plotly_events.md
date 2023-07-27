---
title: Plotly Events
---

Plotly events make it possible to trigger actions based on front-end interactions with Plotly objects such as clicks, mouse hovers, widget or tool interactions, etc. 

## Setting up a Plotly Event

`Plotly` components can have an optional `events` param. This takes `Plotly.Event` objects which are defined by the following attributes:

- **event_name** defines the [Plotly.js event](https://github.com/plotly/react-plotly.js#event-handler-props) to respond to such as a click or hover
- **actions** the Dara actions that should be performed when that event is triggered, for example update a Variable with the coordinates of the point selected. This enables a dynamic layout based on an user's interaction with the plot.
- **custom_js** this js string is designed to update the figure, e.g. when hovering to change a dot color in the plot. To learn more about this is worth checking the [Plotly.js events examples](https://plotly.com/javascript/plotlyjs-events/).

To further understand this, imagine you want to create a scatter plot that when hovering the color of the point selected changes to pink and when clicked turns green. You also want to show the coordinates of the point you are interacting with in your app.

First `event_name`, you will need `plotly_click` and `plotly_hover`, which could also be passed with the help of the component `dara.components.plotting.plotly.plotly.PlotlyEventName` enum as `Plotly.EventName.CLICK` and `Plotly.EventName.HOVER`.

Next `actions` for both we will need to update a `Variable` with the coordinates associated with the interacted point.For this you can use `UpdateVariable` action:

```python
UpdateVariable(
    variable=some_var,
    resolver=lambda ctx: {'x': ctx.inputs.new[0]['x'], 'y': ctx.inputs.new[0]['y']},
)
```
In the case of hover and click events the action context will receive an object containing the data points interacted with. 
To obtain the coordinates we can access the first element, this is the singular data point you clicked. And then return the `x` and `y` values.

Finally it comes down to `custom_js` this is in charge of updating the figure based on some event. In this case you want to change the color of a data point. The `custom_js` function receives two arguments that can be accessed. The first is `data` containing the data of the event performed, the data point clicked/hovered, and the second is the `figure`, which defines the graph state.

```js
// data contains the data points interacted, we get pointNumber which contains the index of the point interacted with
const pn = data.points[0].pointNumber;
// if color for the marker is set get that array otherwise create an array filled with the default color
const colors = data.points[0].marker?.color || new Array(figure.data[0].x.length).fill('#3796F6');
// updated the entry on the array corresponding to the selected data point to be a different color
colors[pn] = '#C54C82';
// update the figure to use this new color array
figure.data[0].marker = {...figure.data[0].marker, color: colors};
```

With that you have all the ingredients to create a Plotly event, full code to the example is shown below:

```python
from dara.core import Variable, py_component, ConfigurationBuilder, UpdateVariable, ComponentInstance, get_icon
from dara.components import Stack, Text, Plotly
import plotly.graph_objects as go

# create a simple plotly figure
def event_example():
    # Create data
    x = [1, 2, 3, 4, 5]
    y = [2, 4, 1, 3, 5]

    # Create scatter plot
    fig = go.Figure(data=go.Scatter(x=x, y=y, mode='markers', marker=dict(size=10)))

    return fig

some_var = Variable('No point selected')

# py_component to show the coordinate values stored in the Variable
@py_component
def show_var(var):
    return Text(str(var))


def plotly_page_content() -> ComponentInstance:
    return Stack(
        Plotly(
            event_example(),
            events=[
                Plotly.Event(
                    # Can add event name as a string or from Plotly.EventName
                    event_name=Plotly.EventName.CLICK,
                    # The code to be executed when clicking on a point
                    custom_js="""
                    const pn = data.points[0].pointNumber;
                    const colors = data.points[0].marker?.color || new Array(figure.data[0].x.length).fill('#3796F6');

                    colors[pn] = '#2CB85C';
                    figure.data[0].marker = {...figure.data[0].marker, color: colors}
                    """,
                    actions=[
                        UpdateVariable(
                            variable=some_var,
                            resolver=lambda ctx: {'x': ctx.inputs.new[0]['x'], 'y': ctx.inputs.new[0]['y']},
                        )
                    ],
                ),
                Plotly.Event(
                    event_name=Plotly.EventName.HOVER,
                    custom_js="""                   
                    const pn = data.points[0].pointNumber;
                    const colors = data.points[0].marker?.color || new Array(figure.data[0].x.length).fill('#3796F6');
                    
                    colors[pn] = '#C54C82';
                    figure.data[0].marker = {...figure.data[0].marker, color: colors};
                    """,
                    actions=[
                        UpdateVariable(
                            variable=some_var,
                            resolver=lambda ctx: {'x': ctx.inputs.new[0]['x'], 'y': ctx.inputs.new[0]['y']},
                        )
                    ],
                ),
            ],
        ),
        show_var(some_var),
    )

config = ConfigurationBuilder()
config.add_page(name='Plotly', content=plotly_page_content(), icon=get_icon('chart-line'))
```