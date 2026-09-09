#!/bin/bash
# Run bearer; installs it if not already installed, then loops through each
# package and runs bearer if it has a JS folder and a package.json.
set -euo pipefail

cd "$(dirname "$0")/../.."

LOCAL_BEARER=./bin/bearer
BEARER_CONFIG=./bearer.yml

if [ ! -f "$LOCAL_BEARER" ]; then
    echo "Installing Bearer"
    curl -sfL https://raw.githubusercontent.com/Bearer/bearer/main/contrib/install.sh | sh -s -- v1.39.0
fi

for package in packages/*/; do
    package=$(basename "$package")
    if [ -d "packages/$package/js" ] && [ -f "packages/$package/package.json" ]; then
        echo "Running Bearer for $package"
        (cd "packages/$package" && ../../"$LOCAL_BEARER" scan js --force --config-file ../../"$BEARER_CONFIG")
    fi
done