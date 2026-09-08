"""Production freshness is verified entirely in Python, including artifact-only images."""

import hashlib
import json
import shutil

import pytest

from dara.core.js_tooling.models import FrontendManifest, Implementation, ProjectError
from dara.core.js_tooling.runtime import _digest, validate_build


@pytest.fixture
def built_project(tmp_path):
    root = tmp_path / 'app'
    source = root / 'js/index.tsx'
    source.parent.mkdir(parents=True)
    source.write_text('export {};')
    output = root / 'dist'
    output.mkdir()
    (output / 'index.html').write_text('<html>compiled</html>')
    manifest = FrontendManifest(
        configuration='app:config',
        dara_version='2.0.0',
        package_requirements=[],
        module_dependencies=[],
        components=[],
        actions=[],
        out_dir=str(output),
    )
    marker = {
        'schema': 1,
        'daraVersion': '2.0.0',
        'contract': manifest.portable(),
        'contractDigest': _digest(manifest.portable()),
        'inputs': [{'root': 'app', 'path': 'js/index.tsx', 'hash': hashlib.sha256(source.read_bytes()).hexdigest()}],
        'directories': [{'root': 'app', 'path': 'js', 'files': ['index.tsx']}],
        'environment': {},
        'files': {'index.html': hashlib.sha256((output / 'index.html').read_bytes()).hexdigest()},
    }
    (output / '.dara-build.json').write_text(json.dumps(marker))
    return root, manifest


def test_runtime_needs_no_javascript_tools(built_project, monkeypatch):
    root, manifest = built_project
    monkeypatch.setenv('PATH', '')
    validate_build(root, manifest)


@pytest.mark.parametrize('change', ['edit', 'delete', 'add'])
def test_checkout_source_changes_require_rebuild(built_project, change):
    root, manifest = built_project
    file = root / 'js/index.tsx'
    if change == 'edit':
        file.write_text('export const changed = true;')
    elif change == 'delete':
        file.unlink()
    else:
        (root / 'js/new.ts').write_text('export {};')
    with pytest.raises(ProjectError, match='run dara build'):
        validate_build(root, manifest)


def test_artifact_only_image_accepts_absent_build_sources(built_project, tmp_path, monkeypatch):
    root, manifest = built_project
    runtime = tmp_path / 'runtime'
    shutil.copytree(root / 'dist', runtime / 'dist')
    manifest.out_dir = str(runtime / 'dist')
    monkeypatch.setenv('PATH', '')
    validate_build(runtime, manifest)
    (runtime / 'dist/index.html').write_text('corrupt')
    with pytest.raises(ProjectError, match='Changed or missing output'):
        validate_build(runtime, manifest)


def test_changed_registrations_fail_even_without_build_sources(built_project):
    root, manifest = built_project
    shutil.rmtree(root / 'js')
    manifest.components.append(Implementation(name='New', source='./js/new.tsx'))
    with pytest.raises(ProjectError, match='Registered implementations'):
        validate_build(root, manifest)


def test_marker_cannot_read_outside_its_source_root(built_project):
    root, manifest = built_project
    file = root / 'dist/.dara-build.json'
    marker = json.loads(file.read_text())
    marker['inputs'][0]['path'] = '../private'
    file.write_text(json.dumps(marker))
    with pytest.raises(ProjectError, match='escapes its root'):
        validate_build(root, manifest)
