---
title: Changelog
---

## NEXT

-   Removed top/bottom padding of `Text` component.
## 0.3.1

-   Added support to apply `hug=True` to `Grid` component. When that happens all of its rows will automatically apply the hug property unless otherwise specified.
-   Fixed `UploadDropzone` not working correctly
-   Fixed `UploadDropzone` not being re-exported from `dara.components` and `dara.components.common`

## 0.3.0

-   Fixed an issue were `Textarea` component did not take widths/heights.
-   Added new prop `resize` to `Textarea` component allowing to set whether the textarea is resizable, and if so, in which directions.
-   Fixed an issue where `Table` columns did not obey widths set.

## 0.2.1

-   Restored `dara.components.graphs`. Components included in the module now use the `cai-causal-graph` library rather than `causal-graph`.

## 0.2.0

-   **WARNING:** DARA_COMPONENTS `graphs` IS TEMPORARILY UNAVAILABLE, USE THE DARA_ENTERPRISE VERSION INSTEAD.

## 0.1.0

-   Initial release, including:
    -   `dara.components.common` - previous `cldp_dashboarding_extension`, and `UploadDropzone` from `cldp_data_extension`
    -   `dara.components.plotting` - previous `cldp_plotting_extension`
    -   `dara.components.graphs` - previous `cldp_causal_graph_extension`
    -   `dara.components.smart` - previous `cldp_smart_components_extension`
