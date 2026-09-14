---
title: Changelog
---

## NEXT

- `create-dara-app` now generates uv-compatible projects instead of Poetry projects. The scaffolded `pyproject.toml` uses a standard Hatchling build backend with a `dependency-groups` dev section, dependencies are installed with `uv sync --locked --all-groups` when available (falling back to `pip`), a `mise.toml` ships with lint/type-check/build/run tasks, and the `--packaging pip|poetry` flag has been removed.
- Generated apps use the Dara 2.0 app-root frontend pipeline. `dara dev` creates the missing frontend files on first run, and the template `mise.toml` also pins Node and pnpm.

## 1.0.0-a.2

- Added a `--packaging` flag, which accepts `poetry` or `pip` as values. This flag allows you to choose the packaging tool to use when scaffolding your project. Defaults to `poetry`. If `poetry` is not installed, it display a warning and fall back to `pip`.

## 1.0.0-a.1

- Initial release
