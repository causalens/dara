---
title: Changelog
---

## NEXT

-   Updated `devtools` to match the current theme.
-   Added `dara-components` and `create-dara-app` as optional dependencies. Use `pip install dara-core[all]` or `poetry add dara-core --extras all` to install them.
-   Fixed an issue where default passwordless auth would sometimes fail to refresh the auth token correctly

## 0.3.2

-   Removed `cl_service_utils` dependency. Internal loggers renamed from `cl.<name>` to `dara.<name>`

## 0.3.1

-   Fixed an issue where `track_progress` would not work correctly on a `py_component`
-   Fixed an issue where `--require-sso` flag would not work correctly

## 0.3.0

-   Removed `Track` action, built-in tracking, and associated `enable_tracking` flag on `ConfigurationBuilder`
-   Added a `add_context_component` method to `ConfigurationBuilder`, to enable external packages to insert context components on the root of the component tree
-   Fixed an issue in the startup command in production `Dockerfile`
-   Fixed an issue where actions outside core would not correctly register their JS module

## 0.2.0

-   Removed `userflow` integration

## 0.1.0

-   Initial release, renamed from `cldp_core` to `dara.core`. Also includes upload endpoint and data utilities from `cldp_data_extension` as `dara.core.data_utils`
