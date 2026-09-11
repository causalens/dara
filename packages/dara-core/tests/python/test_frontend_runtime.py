"""Production freshness is verified entirely in Python, including artifact-only images."""

import hashlib
import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from dara.core.base_definitions import AssetManifest, StaticAsset
from dara.core.js_tooling import project
from dara.core.js_tooling.artifacts import _digest, validate_build
from dara.core.js_tooling.models import FrontendManifest, Implementation, ProjectError, StaticSource
from dara.core.js_tooling.runtime import ArtifactFiles


@pytest.fixture
def built_project(tmp_path):
    root = tmp_path / 'app'
    source = root / 'js/index.tsx'
    source.parent.mkdir(parents=True)
    source.write_text('export {};')
    (root / 'package.json').write_text('{}')
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
        'workspaceRoot': '.',
        'contract': manifest.portable(),
        'contractDigest': _digest(manifest.portable()),
        'inputs': [
            {'root': 'app', 'path': 'js/index.tsx', 'hash': hashlib.sha256(source.read_bytes()).hexdigest()},
            {'root': 'app', 'path': 'package.json', 'hash': hashlib.sha256(b'{}').hexdigest()},
        ],
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


def test_nested_marker_is_an_output_inventory_change(built_project):
    root, manifest = built_project
    nested = root / 'dist/nested'
    nested.mkdir()
    (nested / '.dara-build.json').write_text('{}')
    with pytest.raises(ProjectError, match='inventory changed'):
        validate_build(root, manifest)


def test_new_environment_invalidates_checkout_but_env_files_do_not(built_project, monkeypatch):
    root, manifest = built_project
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    assert not any(entry['path'].startswith('.env') for entry in marker['inputs'])
    marker['environment'] = {'DARA_FRESHNESS_TEST': _digest(None)}
    marker_path.write_text(json.dumps(marker))
    monkeypatch.delenv('DARA_FRESHNESS_TEST', raising=False)
    validate_build(root, manifest)
    monkeypatch.setenv('DARA_FRESHNESS_TEST', 'changed')
    with pytest.raises(ProjectError, match='Changed build environment'):
        validate_build(root, manifest)
    monkeypatch.delenv('DARA_FRESHNESS_TEST')
    # Env files are runtime configuration, like the process environment.
    (root / '.env.production').write_text('PUBLIC_COLOR=blue')
    validate_build(root, manifest)


def test_internal_directory_links_match_builder_inventory(built_project):
    root, manifest = built_project
    (root / 'js/sub').mkdir()
    (root / 'js/sub/a.ts').write_text('export {};')
    (root / 'js/alias').symlink_to(root / 'js/sub', target_is_directory=True)
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['directories'][0]['files'] += ['alias/a.ts', 'sub/a.ts']
    marker_path.write_text(json.dumps(marker))
    validate_build(root, manifest)
    (root / 'js/sub/cycle').symlink_to(root / 'js', target_is_directory=True)
    with pytest.raises(ProjectError, match='Cyclic input directory'):
        validate_build(root, manifest)


def test_partial_checkout_cannot_skip_missing_inputs(built_project):
    root, manifest = built_project
    shutil.rmtree(root / 'js')
    (root / 'package.json').write_text('{}')
    with pytest.raises(ProjectError, match='Changed or missing input'):
        validate_build(root, manifest)


def test_retained_vendor_archive_is_a_partial_checkout(built_project, monkeypatch):
    """Real pnpm file: dependencies remain checkout inputs when conventional config is omitted."""
    root, manifest = built_project
    archive = root / 'vendor/widgets.tgz'
    archive.parent.mkdir()
    archive.write_bytes(b'original archive')
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['inputs'].append(
        {'root': 'app', 'path': 'vendor/widgets.tgz', 'hash': hashlib.sha256(archive.read_bytes()).hexdigest()}
    )
    marker_path.write_text(json.dumps(marker))
    shutil.rmtree(root / 'js')
    (root / 'package.json').unlink()
    archive.write_bytes(b'changed archive')
    monkeypatch.setenv('PATH', '')
    with pytest.raises(ProjectError, match='Changed or missing input'):
        validate_build(root, manifest)
    archive.unlink()
    validate_build(root, manifest)


def test_workspace_topology_survives_relocation_and_missing_workspace_config(
    built_project, tmp_path_factory, monkeypatch
):
    root, manifest = built_project
    library = root.parent / 'library/widget.ts'
    library.parent.mkdir()
    library.write_text('export {};')
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['workspaceRoot'] = '..'
    marker['inputs'].append(
        {'root': 'workspace', 'path': 'library/widget.ts', 'hash': hashlib.sha256(library.read_bytes()).hexdigest()}
    )
    marker_path.write_text(json.dumps(marker))
    moved = tmp_path_factory.mktemp('relocated') / 'workspace'
    shutil.copytree(root.parent, moved)
    app = moved / root.name
    manifest.out_dir = str(app / 'dist')
    monkeypatch.setenv('PATH', '')
    validate_build(app, manifest)
    shutil.rmtree(app / 'js')
    (app / 'package.json').unlink()
    with pytest.raises(ProjectError, match='Changed or missing input'):
        validate_build(app, manifest)
    (moved / 'library/widget.ts').unlink()
    validate_build(app, manifest)


def test_shallow_workspace_inventory_does_not_descend_into_installed_packages(built_project):
    root, manifest = built_project
    library = root / 'library'
    (library / 'node_modules').mkdir(parents=True)
    (library / 'widget.ts').write_text('export {};')
    (library / 'node_modules/cycle').symlink_to(library, target_is_directory=True)
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['directories'].append({'root': 'app', 'path': 'library', 'files': ['widget.ts'], 'recursive': False})
    marker_path.write_text(json.dumps(marker))
    validate_build(root, manifest)
    (library / 'another.ts').write_text('export {};')
    with pytest.raises(ProjectError, match='Changed input inventory'):
        validate_build(root, manifest)


def test_self_referential_symlink_reports_a_build_diagnostic(built_project):
    root, manifest = built_project
    (root / 'js/loop').symlink_to('loop')
    with pytest.raises(ProjectError, match='Symlink loop') as caught:
        validate_build(root, manifest)
    assert caught.value.diagnostic.code == 'build.stale'


@pytest.mark.parametrize(
    'mutation', ['unknown-root', 'traversal', 'bad-hash', 'workspace-descendant', 'boolean-schema']
)
def test_malformed_marker_inputs_fail_even_without_sources(built_project, mutation):
    root, manifest = built_project
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    if mutation == 'unknown-root':
        marker['inputs'][0]['root'] = 'unknown'
    elif mutation == 'traversal':
        marker['inputs'][0]['path'] = '../private'
    elif mutation == 'bad-hash':
        marker['inputs'][0]['hash'] = 'not-a-fingerprint'
    elif mutation == 'workspace-descendant':
        marker['workspaceRoot'] = 'descendant'
    else:
        marker['schema'] = True
    marker_path.write_text(json.dumps(marker))
    shutil.rmtree(root / 'js')
    (root / 'package.json').unlink()
    with pytest.raises(ProjectError) as caught:
        validate_build(root, manifest)
    assert caught.value.diagnostic.code == 'build.stale'


def test_static_url_declarations_participate_in_portable_freshness(built_project):
    root, manifest = built_project
    asset = root / 'asset.txt'
    asset.write_text('static')
    manifest.static = [StaticSource(package='widgets', source=str(asset), target='original.txt')]
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['contract'] = manifest.portable()
    marker['contractDigest'] = _digest(marker['contract'])
    marker['inputs'].append({'root': 'asset:0', 'path': '.', 'hash': hashlib.sha256(asset.read_bytes()).hexdigest()})
    marker_path.write_text(json.dumps(marker))
    validate_build(root, manifest)
    manifest.static[0].target = 'moved.txt'
    with pytest.raises(ProjectError, match='Registered implementations'):
        validate_build(root, manifest)


@pytest.mark.parametrize('private', ['index.html', '.dara-build.json'])
def test_private_output_cannot_be_served_through_a_symlink(built_project, private):
    root, _ = built_project
    (root / 'dist/public-alias').symlink_to(private)
    files = ArtifactFiles(directory=root / 'dist')
    assert files.lookup_path('public-alias') == ('', None)


def test_new_static_directory_requires_a_build_but_omitted_implicit_directory_does_not(built_project):
    root, manifest = built_project
    folder = root / 'static'
    folder.mkdir()
    manifest.app_static = [str(folder)]
    with pytest.raises(ProjectError, match='New static source directory'):
        validate_build(root, manifest)
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['directories'].append({'root': 'appStatic:0', 'path': '.', 'files': []})
    marker_path.write_text(json.dumps(marker))
    validate_build(root, manifest)
    shutil.rmtree(root / 'js')
    (root / 'package.json').unlink()
    folder.rmdir()
    manifest.app_static = []
    validate_build(root, manifest)


def test_runtime_derivation_allows_omitted_package_assets(built_project, monkeypatch):
    root, _ = built_project
    package = root / 'python-package'
    package.mkdir()
    source = package / 'copied.js'
    source.write_text('copied static asset')
    assets = AssetManifest(base_path=str(package), static_assets=[StaticAsset(source='copied.js', target='copied.js')])
    entry = SimpleNamespace(value='dara.core._assets:assets', load=lambda: assets)
    monkeypatch.setattr(project, 'entry_points', lambda **kwargs: [entry])
    monkeypatch.setattr(project, 'npm_version', lambda package: '2.0.0')
    config = SimpleNamespace(
        components=[],
        actions=[],
        auth_config=SimpleNamespace(component_config=SimpleNamespace(model_dump=lambda: {})),
        module_dependencies={},
        static_folders=[],
        static_files_dir='dist',
    )
    manifest = project.derive_manifest(config, root, 'app:config')
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['contract'] = manifest.portable()
    marker['contractDigest'] = _digest(marker['contract'])
    marker['inputs'] += [
        {'root': 'asset:0', 'path': '.', 'hash': hashlib.sha256(source.read_bytes()).hexdigest()},
        {'root': 'favicon', 'path': '.', 'hash': hashlib.sha256(Path(manifest.favicon).read_bytes()).hexdigest()},
    ]
    marker_path.write_text(json.dumps(marker))
    validate_build(root, manifest)
    source.unlink()
    with pytest.raises(ProjectError, match='must exist inside'):
        project.derive_manifest(config, root, 'app:config')
    shutil.rmtree(root / 'js')
    (root / 'package.json').unlink()
    monkeypatch.setenv('PATH', '')
    runtime_manifest = project.derive_manifest(config, root, 'app:config', runtime=True)
    assert runtime_manifest.portable() == manifest.portable()
    validate_build(root, runtime_manifest)


def test_shared_static_directory_keeps_independent_relocatable_registrations(built_project, tmp_path_factory):
    root, manifest = built_project
    shared = root / 'shared'
    shared.mkdir()
    (shared / 'file.js').write_text('static')
    manifest.static = [StaticSource(package='widgets', source=str(shared), target='')]
    manifest.app_static = [str(shared)]
    marker_path = root / 'dist/.dara-build.json'
    marker = json.loads(marker_path.read_text())
    marker['contract'] = manifest.portable()
    marker['contractDigest'] = _digest(marker['contract'])
    for identity in ('asset:0', 'appStatic:0'):
        marker['inputs'].append({'root': identity, 'path': 'file.js', 'hash': hashlib.sha256(b'static').hexdigest()})
        marker['directories'].append({'root': identity, 'path': '.', 'files': ['file.js']})
    marker_path.write_text(json.dumps(marker))
    validate_build(root, manifest)
    relocated = tmp_path_factory.mktemp('installed-assets')
    shutil.copy(shared / 'file.js', relocated / 'file.js')
    manifest.static[0].source = str(relocated)
    manifest.app_static = []
    shutil.rmtree(root / 'js')
    (root / 'package.json').unlink()
    shutil.rmtree(shared)
    validate_build(root, manifest)
    (relocated / 'file.js').write_text('changed')
    with pytest.raises(ProjectError, match='Changed or missing input: asset:0/file.js'):
        validate_build(root, manifest)
