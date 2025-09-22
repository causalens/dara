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

project = os.environ['PROJECT']
version = os.environ['VERSION']
location = os.environ['LOCATION']
repository = os.environ['REPOSITORY']
top_package = os.environ['PACKAGE']
gar_key = os.environ['GAR_KEY_JSON']


# Build reference docs
packages = [
    {'path': 'packages/create-dara-app/create_dara_app', 'name': 'create-dara-app', 'ref_path': 'create_dara_app'},
    {'path': 'packages/dara-components/dara.components', 'name': 'dara-components', 'ref_path': 'dara/components'},
    {'path': 'packages/dara-core/dara.core', 'name': 'dara-core', 'ref_path': 'dara/core'},
]

build(
    packages=[p['path'] for p in packages],
    package_name=top_package,
    base_changelog_path=os.environ.get('CHANGELOG_PATH', 'changelog.md'),
    base_path=os.environ.get('BASE_PATH', './__docs'),
)

# Prepare and upload each package's docs
for package in packages:
    parent_path = os.path.dirname(package['path'])
    name = package['name']
    ref_path = package['ref_path']

    # Copy the package's docs to the __docs folder
    shutil.copytree(os.path.join(parent_path, 'docs'), f'__docs/{name}')

    # Move the generated reference to the correct folder
    shutil.copytree(os.path.join('__docs', 'reference', ref_path), f'__docs/{name}/reference')

    # Merge the sidebar: move the reference sidebar as the last item in the package sidebar
    ref_sidebar_path = os.path.join('__docs', name, 'reference', 'sidebar.json')
    with open(ref_sidebar_path, 'r', encoding='utf-8') as f:
        ref_sidebar_content = json.loads(f.read())

    ref_sidebar_content['label'] = 'Reference'

    main_sidebar_path = os.path.join('__docs', name, 'sidebar.json')
    with open(main_sidebar_path, 'r', encoding='utf-8') as f:
        main_sidebar_content = json.loads(f.read())

    main_sidebar_content['items'].append(ref_sidebar_content)
    with open(main_sidebar_path, 'w', encoding='utf-8') as f:
        json.dump(main_sidebar_content, f, indent=2)

    # remove the reference sidebar
    os.remove(ref_sidebar_path)

    # Zip the docs directory
    directory = Path('__docs/') / name
    with ZipFile('docs.zip', 'w') as archive:
        for file_path in directory.rglob('*'):
            archive.write(
                file_path,
                arcname=file_path.relative_to(directory),
            )

    # Upload to GAR
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
            'package_id': package['name'],
            'version_id': version,
        }

        files = {
            'meta': (None, str(metadata), 'application/json'),
            'blob': ('SOURCE', f),
        }

        response = requests.post(url, headers=headers, files=files)
        response.raise_for_status()
        os.remove('docs.zip')

# Cleanup
shutil.rmtree('__docs')
