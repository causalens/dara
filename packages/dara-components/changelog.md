---
title: Changelog
---

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
