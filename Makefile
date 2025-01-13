# Boostrap the js modules
deps-project:
	@echo "******************************************************************************"
	@echo "Installing Lerna to npm global"
	pnpm install --frozen-lockfile
	sed -i '$$ d' .npmrc

# Preprocess resources required to test or build packages
prepare:
	lerna run build

# Install any deps and prepare any docs that need to be built without requiring all modules to be installed
prepare-docs:
	chmod +x tooling/scripts/prepare_docs.sh
	tooling/scripts/prepare_docs.sh

# Run lint / static testing
lint:
	poetry anthology run lint && lerna run lint

format:
	poetry anthology run format && lerna run format

format-check:
	poetry anthology run format-check && lerna run format:check

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
	poetry anthology run test && lerna run test

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


# Publish all the packages to the appropriate repositories, creating a version bump commit
# Before committing, revert changes to readmes they are only for PyPi
publish:
	poetry config pypi-token.pypi $${PYPI_TOKEN}
	poetry anthology run publish

	git checkout -- **/README.md
	git checkout -- .npmrc
	git add .
	git commit -m "Version bump to $${VERSION_TAG} [skip ci]"

	echo "//registry.npmjs.org/:_authToken=$${NPMJS_TOKEN}" >> .npmrc
	git update-index --assume-unchanged .npmrc
	lerna publish from-package --yes --no-git-reset --no-push --no-git-tag-version --force-publish
	sed -i '$$ d' .npmrc

publish-docs:
	poetry source add --priority=supplemental causalens https://us-central1-python.pkg.dev/causalens-internal/python-internal/simple
	poetry add --source=causalens docs-builder@~0.2.8
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
