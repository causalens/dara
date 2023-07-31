---
title: Changelog
---

## NEXT

- Added a `--packaging` flag, which accepts `poetry` or `pip` as values. This flag allows you to choose the packaging tool to use when scaffolding your project. Defaults to `poetry`. If `poetry` is not installed, it display a warning and fall back to `pip`.
- Added a `--pre` flag, which allows you to accept pre-release versions of dependencies. This flag is passed to the packaging tool, i.e. `poetry install --allow-prereleases` or `pip install --pre`.

## 1.0.0-a.1

- Initial release
