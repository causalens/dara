---
title: Changelog
---

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
