---
title: Changelog
---

## NEXT

- Migrated the repository's Python tooling from Poetry/Anthology to uv + mise. Package metadata is now generated with Hatchling; `create-dara-app` no longer depends on Poetry.

## 1.0.0-a.2

- Added a `--packaging` flag, which accepts `poetry` or `pip` as values. This flag allows you to choose the packaging tool to use when scaffolding your project. Defaults to `poetry`. If `poetry` is not installed, it display a warning and fall back to `pip`.

## 1.0.0-a.1

- Initial release
