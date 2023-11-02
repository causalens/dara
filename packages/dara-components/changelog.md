---
title: Changelog
---

## NEXT

-   **Backported**: Changed `Plotly` default `min-height` to be `350px`.
-   **Backported**: Changed default font-sizes for `Bokeh` and `Plotly` components to use `16px` for title, and `14px` for axis labels, legends and tooltips.
-   **Backported**: Reduced default `Plotly` margins. Update default tooltip background color to be grey.
-   **Backported**: Fixed an issue where Plotly could have a jittery behaviour on Notebooks.
-   **Backported**: Added a default `min-height` of `200px` for `Plotly`, this can be overwritten by setting the `min_height` prop or by passing `raw_css`.
-   **Backported**: Fixed an issue where Plotly's hover did not use the correct font.
-   **Backported**: Fixed an issue where `Input` of type number displayed zero instead of null when null value was set.
-   **Backported**: Fixed issue where in some cases if `Input` of type number value variable was update outside the component, the value would not show.
-   **Backported**: Fixed an issue where if `RadioGroup` had a `value` of an empty `Variable` that that `Variable` would not update.
-   **Backported**: Fixed an issue where `Table` would always overflow
-   **Backported**: Fixed an issue where `NaN` was not handled in `Input` with `type=number`
-   **Backported**: Fixed an issue where one could not set `margin` to `Text` component

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
