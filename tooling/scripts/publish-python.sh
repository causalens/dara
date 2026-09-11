#!/bin/bash
# Publish Python wheels to PyPI, skipping artifacts that were already uploaded
# by a previous release attempt (uv checks the index first, like
# `poetry publish --skip-existing`).
set -euo pipefail

cd "$(dirname "$0")/../.."

: "${PYPI_TOKEN:?PYPI_TOKEN must be set}"

uv publish --token "$PYPI_TOKEN" --check-url https://pypi.org/simple/