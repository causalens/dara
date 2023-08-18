"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""
import os
import shutil
import requests
from pathlib import Path
from requests.auth import HTTPBasicAuth
from zipfile import ZipFile

from docs_builder.reference_docs_build import build

os.mkdir('__docs')

package = os.environ['PACKAGE']
version = os.environ['VERSION']

# Build reference docs
if os.environ.get('BUILD_REFERENCE') == 'true':
    package_paths = os.environ.get('PACKAGE_PATHS', '').strip().split('\n')

    build(
        packages=package_paths,
        package_name=package,
        base_changelog_path=os.environ.get('CHANGELOG_PATH', 'changelog.md'),
        base_path=os.environ.get('BASE_PATH', './__docs')
    )

# Combine narrative docs with references
shutil.copytree(os.environ.get('DOCS_PATH', 'docs'), '__docs/docs')

# Zip the docs directory
directory = Path('__docs/')
with ZipFile('docs.zip', 'w') as archive:
    for file_path in directory.rglob("*"):
        archive.write(
            file_path,
            arcname=directory.name / file_path.relative_to(directory)
        )

# Upload to Artifactory
artifactory_user = os.environ['ARTIFACTORY_USERNAME']
artifactory_password = os.environ['ARTIFACTORY_PASSWORD']

artifactory_url = os.environ['ARTIFACTORY_URL']
artifactory_repository = os.environ['ARTIFACTORY_REPOSITORY']

with open('docs.zip', 'rb') as f:
    url = f"{artifactory_url}/{artifactory_repository}/{package}/{version}/docs.zip"
    response = requests.put(url, auth=HTTPBasicAuth(artifactory_user, artifactory_password), data = f)
    response.raise_for_status()

# Cleanup
shutil.rmtree('__docs')
os.remove('docs.zip')
