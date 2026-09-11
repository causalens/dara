#!/bin/bash
# Bump the lockstep workspace version. Replaces `poetry anthology version`.
#
# Usage:
#   bump_python_versions.sh <exact-version>
#       Rewrite the version in the root and Python package pyprojects
#       (including the workspace sibling version pins) and refresh uv.lock.
#       Used by the release workflow before the lerna version bump.
#
#   bump_python_versions.sh patch|minor|major
#       Run the full local release-prep bump: lerna version for the JS
#       packages, pnpm lockfile update, then the Python rewrite above.
#       Used by the version-patch/minor/major mise tasks.
set -euo pipefail

cd "$(dirname "$0")/../.."

mode="${1:?Usage: bump_python_versions.sh <exact-version>|patch|minor|major}"
OLD="$(node -p 'require("./lerna.json").version')"

rewrite_python_versions() {
    local NEW="$1"
    local FILES=(
        pyproject.toml
        packages/dara-core/pyproject.toml
        packages/dara-components/pyproject.toml
        packages/create-dara-app/pyproject.toml
        packages/demo-app/pyproject.toml
    )
    for f in "${FILES[@]}"; do
        sed -E -i.bak \
            -e "s/^version = \"$OLD\"/version = \"$NEW\"/" \
            -e "s/(dara-core|dara-components|create-dara-app)==$OLD/\1==$NEW/g" \
            "$f"
        rm -f "$f.bak"
    done
    uv lock
    echo "Bumped $OLD -> $NEW in pyprojects and refreshed uv.lock"
}

case "$mode" in
    patch|minor|major)
        pnpm lerna version "$mode" --no-private --no-git-tag-version --force-publish --exact --yes
        pnpm i --lockfile-only
        NEW="$(node -p 'require("./lerna.json").version')"
        rewrite_python_versions "$NEW"
        ;;
    *)
        if ! [[ "$mode" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-._].+)?$ ]]; then
            echo "Expected an exact version (e.g. 1.29.11) or patch/minor/major, got: $mode" >&2
            exit 1
        fi
        rewrite_python_versions "$mode"
        ;;
esac