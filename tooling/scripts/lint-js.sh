#!/bin/bash
# Run JS linting: oxlint via the glob runner, then stylelint (was `make lint-js`).
set -euo pipefail

cd "$(dirname "$0")/../.."

JS_BIN=./node_modules/.bin

"$JS_BIN/glob" -A -c "$JS_BIN/oxlint" \
    'packages/{dara-components,dara-core}/js/' \
    'packages/dara-core/{tests,cypress}/' \
    'packages/ui-causal-graph-editor/tests/' \
    'packages/{styled-components,ui-*}/src/'

"$JS_BIN/stylelint" \
    'packages/{dara-components,dara-core}/js/**/*.{ts,tsx}' \
    'packages/{styled-components,ui-*}/src/**/*.{ts,tsx}' \
    --cache --cache-strategy content