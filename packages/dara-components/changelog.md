---
title: Changelog
---

## NEXT

-  Fixed an issue where `Slider` component would not raise on invalid domain values where step was inferred.

## 1.15.3

-  Fixed an issue where `Plotly` component would shrink to zero width in a vertical flex container with `align-items` set to any value other than `stretch`

## 1.14.8

-  Clarified `Variable` usage in the docs of some components.

## 1.14.3

-   Added the `language` prop to the `CodeEditor` component to allow for setting the language of the code editor.

## 1.14.0

-   Fixed an issue where `Plotly`'s figure native `height` and `width` were not obeyed by component.

## 1.13.1

-   Fixed an issue where `Table` would sometimes convert timestamps in seconds as if they were in milliseconds.
-   Fixed an issue where `CheckboxGroup` could not have an `undefined` value.
-   Fixed an issue where `Plotly` in some cases would not pick up colors from dara theme by default.

## 1.12.3

-   Fixed an issue where `Table` filters and column sorting would not work correctly due to a prefix in column names.

## 1.12.2

-   Fixed an issue where `Table` cells would not render due to `/schema` GET request failing.

## 1.12.1

-   Fixed invisible boolean values in `Table` cells.
-   `Table` now automatically renders all index columns from the DataFrame and expands hierarchical columns.

## 1.11.5

-   Visual tweaks to `Chat` component.

## 1.11.4

-   Updated `Code` component to support copy to clipboard functionality.
-   Updated `Code` component default themes.
-   Updated `Code` component to display current language.

## 1.10.6

-   Increased performance for initial render of `CausalGraphViewer` by up to 2x
-   Increased performance when updating large graphs in `CausalGraphViewer` by up to 50x

## 1.10.4

-   Fixed an issue where `Input` of type number would return `NaN` instead of `None` within actions.

## 1.10.3

-   Fixed an issue where `onchange` would not fire for `Input` and `Textarea` components in some cases
-   Fixed and issue where the nodes could escape their containers in grouping layouts.

## 1.10.0

-   Added support for grouping layout in `FcoseLayout` and `SpringLayout`. It allows for nodes to be placed on groups/clusters which can be collapsed/expanded in order to simplify large graphs to the user whilst still allowing them to see the full picture.

## 1.9.5

-   Increased performance of various `Select` and `Datepicker` components in large lists by up to 485x.
-   Fixed a crash when `selected_items=None` was passed to `Select(multiselect=True, ...)`.

## 1.9.4

-   Revert: "Remove redundant `None` properties when serializing components to JSON". This will be brought back in a future minor release

## 1.9.3

-   Allow components to receive `None` as one of their `children`
-   Remove redundant `None` properties when serializing components to JSON
-   Fix an issue where `Select` component would error out in few rare cases

## 1.9.2

-   Fixed an issue with `Card` where its content would render with zero height in some scenarios due to a missing `flex-grow` property.
-   Clarified docs for `CausalGraphViewer`'s `editor_mode` prop.
-   Fixed an issue where the `CausalGraphViewer` would error if the graph was empty in some cases
-   Added a new 'Save as Image' button to the `CausalGraphViewer` UI to download the currently displayed graph pane as a high-resolution PNG image.
-   Fixed an issue where `value` of `Select(multiselect=True, ...)` value would not be displayed even when it's outside the items list.

## 1.8.6

-   Fixed an issue where `Chat` button looked off centre on different base font size apps.
-   Fixed an issue where if parent hugged content `NodeHierarchyBuilder` would always scroll.
-   Fixed an issue where `CausalGraphViewer`'s `FcoseLayout` would crash when an array of array of nodes was passed to tiers which included a node that did not exist on the graph.
-   Fixed an issue where other `Select` component types would degrade performance with large number of items (`multiselect=True` has been fixed in v1.8.3).

## 1.8.5

-   Internal (JS): Updated `Markdown` to use `dara-ui`'s component.
-   Updating default theme for `Bokeh` and `Plotly` so that background is transparent by default.
-   `Chat` component button is now attached to the container it was added in instead of the page. This means it is now possible to add multiple chat components in a page.

## 1.8.3

-   `CausalGraphViewer` now only recalculates its layout on resize of the graph window if the graph is not in focus.
-   Fixed an issue where `Select(..., multiselect=True)` would cause excessive rerenders and degrade performance when
    then number of items in the select was large.

## 1.8.2

-   Fix type of `default_legends` in `CausalGraphViewer` and `VisualEdgeEncoder` to reflect that it does not accept `None`.
-   Fixed an issue where empty `Chat` component caused an error due to having undefined length.

## 1.8.1

-   `Chat` component now shows the user who has written a message
-   `Chat` component now displays its messages content as `Markdown`.
-   It is now possible to add a callback to your configuration for when a message is sent in `Chat` component, an example can be found below:

```python
from dara.core.configuration import ConfigurationBuilder
from dara.components.smart.chat import NewMessageBody, ChatConfig


def example_callback(payload: NewMessageBody):
    print('New message received!')
    print(payload)

config = ConfigurationBuilder()
config.add_configuration(ChatConfig(on_new_message=example_callback))
```

## 1.8.0

-   In `Chat` messages, changed `timestamp` prop to be divided into two `created_at` and `updated_at`.
-   Added "(edited)" indicator to the messages which have been edited in the `Chat` component.
-   `Chat` will now send a message when `Enter` is pressed by the user.
-   `Chat` now shows a disabled state for the `Send` button if the message to be sent is empty.

## 1.7.7

-   Fixed an issue where if `EditorMode` was not defined edges were always added as undirected.
-   Fixed an issue where graph rendering would enter an infinite loop and cause crashes in some circumstances.

## 1.7.6

-   Fixed an issue where if a word was too long, such as in an url, the `Chat` message would overflow instead of wrap.
-   Fixed an issue where in `Chat` component if a newline character was added to a comment, on subsequent reloads it would show '/n' in the message.

## 1.7.5

-   Added new `Chat` component. It can be added to any page to display a chat interface where users can add comments about their apps.
-   Fixed an issue with `NumericInput` where one could not enter decimal numbers ending in 0.
-   Fixed an issue where one was not able to type a negative number in `NumericInput` unless they started with the number before adding the sign.
-   Graph layout is now recalculated after every resize of the graph window detected, preventing scenarios where the initially computed layout is not optimal for the new window size due to a sudden graph pane resize
-   Zooming the graph with mousewheel is now disabled by default and requires first focusing the graph by clicking on it. This is to prevent accidental zooming when scrolling through the page. The previous behaviour can be restored by setting `require_focus_to_zoom` prop to False.
-   Fixed issues with graph viewer tooltip appearing even over parts of the graph which are not currently visible on the screen.
-   Updated so that `TimeSeriesCausalGraph` now only adds to layers nodes which have at least one other node with the same `variable_name`.
-   Updated so that is `PlanarLayout` is chosen we do not add the tiers for `TimeSeriesCausalGraph`.
-   Fixed an issue where one could not add nodes to a `TimeSeriesCausalGraph`.

## 1.7.2

-   Internal (JS): `UploadDropzone` now uses `RequestExtras` to pass additional headers to the upload request.
-   `UploadDropzone` now has `enable_paste` prop to conditionally activate paste functionality, allowing for more customizable behavior. By default, pasting text directly into the `UploadDropzone` is now disabled, requiring explicit activation via the `enable_paste` prop.

## 1.7.0

-   Added a new prop `default_legends` to `CausalGraphViewer` and `VisualEdgeEncoder` which allows the user to update the default legends that appear for each `editor_mode`.
-   Improved typing of `additional_legends`, and added the ability to add nodes as a legend item.

## 1.6.4

-   **Backported** Internal (JS): `UploadDropzone` now uses `RequestExtras` to pass additional headers to the upload request.
-   **Backported** `UploadDropzone` now has `enable_paste` prop to conditionally activate paste functionality, allowing for more customizable behavior. By default, pasting text directly into the `UploadDropzone` is now disabled, requiring explicit activation via the `enable_paste` prop.

## 1.6.2

-   Added `zeroline` default color to `Plotly` theme.

## 1.6.0

**Graphs**

-   Added support for tiered layout in `FcoseLayout`, `PlanarLayout`, `SpringLayout` and `MarketingLayout`. It allows for nodes to be placed on tiers following some hierarchy and to further define requirements of nodes positions within that tier.
-   If `TimeSeriesCausalGraph` object is passed to `CausalGraphViewer` and no tiers are defines, it will use `time_lag` and `variable_name` to define the `order_nodes_by` and `group` respectively.
-   Added `simultaneous_edge_node_selection` to `CausalGraphViewer`, when set to True, the selected node will not be reset when an edge is chosen and vice versa.
-   Added `layering_algorithm` prop to `PlanarLayout`. This allows users to choose between `LayeringAlgorithm.SIMPLEX` and `LayeringAlgorithm.LONGEST_PATH` for the layering step of the d3-dag sugyiama algorithm.

**Plotting**

-   Set `Bokeh` default `min-height` and `min-width` to `350px`.

**Common**

-   **Renamed:** `align-items` to `align` in `Grid.Column` to be more consistent with other layout components.
-   Added `justify` and `align` shortcut props to `Card`, `Modal`, `Form`, `Grid`, `Grid.Row`, `Grid.Column`.
-   Fixed an issue where if setting an initial number value to `Select` and it had a list of `Item`s, then the value showed was the number instead of the corresponding label to that value.
-   Fixed an issue where if selecting the start or end date in a `Datepicker` always resulted in the user selecting the whole range instead of the selected input.
-   `Button` text now uses `blue1` color.

## 1.5.2

-   Fixed an issue where dragging nodes too quickly in `CausalGraphViewer` would cause the node drag to stop working
-   Fixed an issue where `Soft Directed` edge was not shown in the legend of `VisualEdgeEncoder`

## 1.5.1

-   Updated plotting palettes to support 1 or 2 colors as well as 3+.

## 1.5.0

-   Fixed an issue where `Anchor` and `Image` component would not handle relative links correctly when ran in an app with a custom base URL (e.g. in an iframe).
-   Fixed an issue where `CausalGraphViewer` did not accept a `dict` of a `CausalGraph`.
-   Added support for `cai_causal_graph.causal_graph.Skeleton` in `CausalGraphViewer`.

## 1.4.6

-   Updated `EdgeConstraintType` to comply to `0.3.0` of `cai-causal-graph`.
-   `EdgeEncoder` now supports `SOFT_DIRECTED` edge constraint types, displaying a different arrow with a semi-circle tip
-   `CausalGraphViewer` components now properly include `source` and `destination` fields in edge data output as serialized node data rather than their identifiers
-   Updated so that if no `editor_mode` is passed to `CausalGraphViewer`, then it checks if graph is DAG, if so `editor_mode` defaults to `EditorMode.DEFAULT`, else defaults to `EditorMode.PAG`. However if `graph_layout` is `PlanarLayout` then it will always be set to `EditorMode.DEFAULT`

## 1.4.5

-   Changed `Plotly` default `min-height` to be `350px`.
-   Changed default font-sizes for `Bokeh` and `Plotly` components to use `16px` for title, and `14px` for axis labels, legends and tooltips.
-   Reduced default `Plotly` margins. Update default tooltip background color to be grey.
-   Fixed an issue where if `RadioGroup` had a `value` of an empty `Variable` that that `Variable` would not update.

## 1.4.4

-   Fixed an issue where Plotly could have a jittery behaviour on Notebooks.
-   Added a default `min-height` of `200px` for `Plotly`, this can be overwritten by setting the `min_height` prop or by passing `raw_css`.
-   Fixed an issue where Plotly's hover did not use the correct font.

## 1.4.2

-   Fixed an issue where `Input` of type number displayed zero instead of null when null value was set.

## 1.4.1

-   Fixed issue where in some cases if `Input` of type number value variable was update outside the component, the value would not show.

## 1.4.0

-   Added support for displaying a `value` in `Select` that may not be part of the `items` list.

## 1.3.2

-   Fixed an issue where `Table` would always overflow
-   Fixed an issue where `NaN` was not handled in `Input` with `type=number`
-   Fixed an issue where one could not set `margin` to `Text` component
-   Fixed an issue where `Input` with `type='number'` width could not be changed.
-   Fixed an issue where `Input` with `type='number'` overflowed when hovered.
-   Fixed an issue where `Input` with `type='number'` did not take full space available to it.
-   Fixed an issue where `Datepicker` could be overlapped by other components in a horizontal container.
-   Fixed an issue where `Select`'s (with `multiselect=True`) input took too much space

## 1.2.3

-   **Backported** Fixed an issue where `Table` would always overflow
-   **Backported** Fixed an issue where `NaN` was not handled in `Input` with `type=number`
-   **Backported** Fixed an issue where one could not set `margin` to `Text` component
-   **Backported** Fixed an issue where `Input` with `type='number'` width could not be changed.
-   **Backported** Fixed an issue where `Input` with `type='number'` overflowed when hovered.
-   **Backported** Fixed an issue where `Input` with `type='number'` did not take full space available to it.
-   **Backported** Fixed an issue where `Datepicker` could be overlapped by other components in a horizontal container.
-   **Backported** Fixed an issue where `Select`'s (with `multiselect=True`) input took too much space

## 1.1.10

-   Internal: `parseLayoutDefinition` and `GraphLayoutDefinition` are now exposed on js side `CausalGraph` object can now accept extras.

## 1.1.9

-   Fixed an issue where `Table` search bar was hidden by the table itself
-   Fixed an issue where `Datepicker` in controlled mode would sometimes end up in an infinite loop.
-   Fixed an issue where `Datepicker` if range was given did not show end year in the select.
-   Fixed an issue where `Table` column resizing would not affect cell width.

## 1.1.8

-   Fixed an issue where `Table` did not return the correct index row when sorted
-   Fixed an issue where `Table` selection was not persistent. This can now be achieved by passing a `Variable` to `selected_indices` with the `persist_value=True` flag

## 1.1.7

-   Internal: store upload resolvers in a separate registry

## 1.0.1

-   Fixed an issue where `Switch` would not be aligned by default with other components
-   Fixed an issue where `Select` did not accept `items` containing a `DerivedVariable` with a list of strings.

## 1.0.0-a.1

-   Initial release
