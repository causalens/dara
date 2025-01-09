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
import json
import os
import shutil
from pathlib import Path
from zipfile import ZipFile

import google.auth
import google.auth.transport.requests
import requests
from docs_builder.reference_docs_build import build
from google.oauth2.service_account import Credentials

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
        base_path=os.environ.get('BASE_PATH', './__docs'),
    )

# Combine narrative docs with references
shutil.copytree(os.environ.get('DOCS_PATH', 'docs'), '__docs/docs')

# Zip the docs directory
directory = Path('__docs/')
with ZipFile('docs.zip', 'w') as archive:
    for file_path in directory.rglob('*'):
        archive.write(
            file_path,
            arcname=directory.name / file_path.relative_to(directory),
        )

# Upload to GAR
project = os.environ['PROJECT']
version = os.environ['VERSION']
location = os.environ['LOCATION']
repository = os.environ['REPOSITORY']
package = os.environ['PACKAGE']
gar_key = os.environ['GAR_KEY_JSON']


with open('docs.zip', 'rb') as f:
    creds = Credentials.from_service_account_info(
        json.loads(gar_key),
        scopes=['https://www.googleapis.com/auth/cloud-platform'],
    )

    auth_req = google.auth.transport.requests.Request()
    creds.refresh(auth_req)

    headers = {
        'Authorization': f'Bearer {creds.token}',
    }

    url = f'https://artifactregistry.googleapis.com/upload/v1/projects/{project}/locations/{location}/repositories/{repository}/genericArtifacts:create?alt=json'

    metadata = {
        'filename': 'docs.zip',
        'package_id': package,
        'version_id': version,
    }

    files = {
        'meta': (None, str(metadata), 'application/json'),
        'blob': ('SOURCE', f),
    }

    response = requests.post(url, headers=headers, files=files)
    response.raise_for_status()

# Cleanup
shutil.rmtree('__docs')
os.remove('docs.zip')
