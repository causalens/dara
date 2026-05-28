# Boostrap the js modules
deps-project:
	@echo "******************************************************************************"
	@echo "Installing Lerna to npm global"
	pnpm install --frozen-lockfile
	@if [ -f .npmrc ]; then sed -i '$$ d' .npmrc; fi

# Preprocess resources required to test or build packages
prepare:
	pnpm lerna run build

prepare-dev:
	pnpm lerna run prepare-dev

# Install any deps and prepare any docs that need to be built without requiring all modules to be installed
prepare-docs:
	chmod +x tooling/scripts/prepare_docs.sh
	tooling/scripts/prepare_docs.sh

# Run lint / static testing
lint:
	poetry anthology run lint && pnpm lerna run lint

format:
	poetry anthology run format && pnpm lerna run format

format-check:
	poetry anthology run format-check && pnpm lerna run format:check

# Run security scan
security-scan:
	poetry anthology run security-scan

# Local bearer is expected in ./bin/bearer
LOCAL_BEARER := ./bin/bearer
BEARER_CONFIG := ./bearer.yml

# Run bearer; installs if not already installed, then loops through each package and runs bearer if it has a JS folder and a package.json
bearer:
	@if [ ! -f "$(LOCAL_BEARER)" ]; then \
		echo "Installing Bearer"; \
		curl -sfL https://raw.githubusercontent.com/Bearer/bearer/main/contrib/install.sh | sh -s -- v1.39.0; \
	fi

	@for package in $(shell ls packages) ; do \
		if [ -d "packages/$$package/js" ] && [ -f "packages/$$package/package.json" ]; then \
			echo "Running Bearer for $$package"; \
			cd packages/$$package && ../../$(LOCAL_BEARER) scan js --force --config-file ../../$(BEARER_CONFIG); \
			EXIT_CODE=$$?; \
			if [ $$EXIT_CODE -ne 0 ]; then \
				exit $$EXIT_CODE; \
			fi; \
			cd ../..; \
		fi \
	done


# Link .venvs within packages to the top-level .venv
link:
	./tooling/scripts/link-packages.sh

# Run tests
test:
	poetry anthology run test && pnpm lerna run test

# Version all the main packages in lockstep as a patch - run pnpm i and lock to update the lockfiles accordingly
version-patch:
	@pnpm lerna version patch --no-private --no-git-tag-version --force-publish --exact --yes && pnpm i --lockfile-only && poetry anthology version patch && poetry anthology install
version-minor:
	@pnpm lerna version minor --no-private --no-git-tag-version --force-publish --exact --yes && pnpm i --lockfile-only && poetry anthology version minor && poetry anthology install
version-major:
	@pnpm lerna version major --no-private --no-git-tag-version --force-publish --exact --yes && pnpm i --lockfile-only && poetry anthology version major && poetry anthology install
# Run a anthology script without using anthology itself
run:
	poetry anthology run $(script)


# Publish Python packages to PyPI, skipping artifacts that were already uploaded
# by a previous release attempt.
publish-python:
	poetry config pypi-token.pypi $${PYPI_TOKEN}
	poetry anthology run publish

# Publish JavaScript packages to npm, skipping packages whose version is already
# present in the registry.
publish-npm:
	rm -f .npmrc
	pnpm lerna publish from-package --yes --no-git-reset --no-push --no-git-tag-version

publish: publish-python publish-npm

publish-docs:
	poetry source add --priority=supplemental causalens https://us-central1-python.pkg.dev/causalens-internal/python-internal/simple
	poetry add --source=causalens docs-builder@~0.2.14
	poetry run python ./tooling/scripts/docs-upload.py

# Clean development artifacts from the repository
clean:
	git clean -xfd .

# Update all deps from ui monorepo to latest version
update-ui-deps:
	pnpm --recursive --latest update\
		@darajs/styled-components\
		@darajs/eslint-config\
		@darajs/prettier-config\
		@darajs/stylelint-config\
		@darajs/ui-causal-graph-editor\
		@darajs/ui-code-editor\
		@darajs/ui-components\
		@darajs/ui-hierarchy-viewer\
		@darajs/ui-icons\
		@darajs/ui-notifications\
		@darajs/ui-utils\
		@darajs/ui-widgets
