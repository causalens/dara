#!/bin/bash
# Build and upload the reference docs (was `make publish-docs`).
#
# docs-builder is only published to the causalens internal index, so it is
# pulled into an ephemeral uv environment here instead of being a project
# dependency. Credentials arrive through the uv index env vars, which the CI
# workflow sets from GAR_KEY_JSON.
set -euo pipefail

cd "$(dirname "$0")/../.."

: "${PROJECT:?PROJECT must be set}"
: "${LOCATION:?LOCATION must be set}"
: "${REPOSITORY:?REPOSITORY must be set}"
: "${PACKAGE:?PACKAGE must be set}"
: "${GAR_KEY_JSON:?GAR_KEY_JSON must be set}"
: "${VERSION:?VERSION must be set}"

export UV_INDEX_CAUSALENS_USERNAME=_json_key
export UV_INDEX_CAUSALENS_PASSWORD="$GAR_KEY_JSON"

uv run --no-project \
    --index causalens=https://us-central1-python.pkg.dev/causalens-internal/python-internal/simple \
    --with 'docs-builder>=0.2.14,<0.3.0' \
    --with 'google-auth>=2.37.0,<3.0.0' \
    python ./tooling/scripts/docs-upload.py