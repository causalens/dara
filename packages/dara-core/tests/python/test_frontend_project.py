"""Contracts shared by preparation, the Vite runner and artifact-only runtime."""

import json
import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest

from dara.core.auth.base import AuthComponent, AuthComponentConfig
from dara.core.auth.basic import DefaultAuthConfig
from dara.core.base_definitions import ActionImpl, AssetManifest, StaticAsset
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.internal.import_discovery import create_action_definition, create_component_definition
from dara.core.js_tooling import project
from dara.core.js_tooling import workspace as workspace_files
from dara.core.js_tooling.models import FrontendManifest, ProjectError, Requirement
from dara.core.js_tooling.project_files import read_yaml
from dara.core.js_tooling.source import parse_js_source


@pytest.fixture
def manifest():
    return FrontendManifest(
        configuration='example.main:config',
        dara_version='2.0.0',
        package_requirements=[Requirement(name='react', specifier='^18.3.0')],
        module_dependencies=[],
        components=[],
        actions=[],
        out_dir='dist',
    )


@pytest.fixture
def workspace_members(monkeypatch):
    """Stub pnpm's membership response while retaining real project-file parsing."""

    def declare(*roots):
        monkeypatch.setattr(
            workspace_files,
            '_query_members',
            lambda workspace, processes=None: tuple(root for root in roots if (root / 'package.json').exists()),
        )

    return declare


@pytest.mark.parametrize(
    'source',
    [
        '/tmp/component.tsx',
        '../js/component.tsx',
        './js/../../secret.ts',
        'C:\\app\\component.tsx',
        'https://example.com/component.js',
        '@pkg/name/../private',
    ],
)
def test_sources_cannot_escape_the_import_contract(source):
    with pytest.raises(ValueError, match='js_source'):
        parse_js_source(source)


def test_source_and_serialized_identity_are_independent():
    class Chart(ComponentInstance):
        js_source = './js/charts/chart.tsx'
        py_component = 'ExistingChart'

    class NavigateImpl(ActionImpl):
        js_source = '@widgets/actions/navigate'
        py_name = 'ExistingNavigate'

    component = create_component_definition(Chart)
    action = create_action_definition(NavigateImpl)
    assert component.name == Chart().model_dump()['name'] == 'ExistingChart'
    assert action.name == NavigateImpl().model_dump()['name'] == 'ExistingNavigate'
    assert component.js_source == './js/charts/chart.tsx'
    assert action.js_source == '@widgets/actions/navigate'


def test_auth_routes_use_source_identity_and_share_implementations(tmp_path, monkeypatch):
    login = AuthComponent(js_source='@custom/auth/login', py_module='custom_auth')
    logout = AuthComponent(js_source='./js/logout.tsx', py_module='app')

    class CustomAuth(DefaultAuthConfig):
        component_config = AuthComponentConfig(login=login, logout=logout, extra={'callback': login})

    builder = ConfigurationBuilder()
    builder.auth_config = CustomAuth()
    monkeypatch.setattr(project, 'npm_version', lambda package: '2.0.0')
    monkeypatch.setattr(project, 'entry_points', lambda **kwargs: [])

    config = builder._to_configuration()
    manifest = project.derive_manifest(config, tmp_path, 'app:config')
    routes = config.auth_config.component_config.model_dump()

    assert routes == {'login': login, 'logout': logout, 'callback': login}
    assert [(item.name, item.source) for item in manifest.auth] == [
        ('./js/logout.tsx', './js/logout.tsx'),
        ('@custom/auth/login', '@custom/auth/login'),
    ]
    assert all(route['js_source'] in {item.name for item in manifest.auth} for route in routes.values())


def test_registered_concrete_class_needs_a_source():
    class Missing(ComponentInstance):
        pass

    with pytest.raises(ValueError, match='must define js_source'):
        create_component_definition(Missing)


def test_asset_registration_rejects_old_contract_and_traversal():
    with pytest.raises(ValueError, match='static_assets'):
        AssetManifest(base_path='.', autojs_assets=[])
    with pytest.raises(ValueError, match='relative'):
        StaticAsset(source='common', target='../outside')


def test_preparation_preserves_user_ownership_and_is_idempotent(tmp_path: Path, manifest):
    package = {
        'name': 'app',
        'private': True,
        'scripts': {'test': 'app-tests'},
        'dependencies': {'user-package': '^1.0.0'},
        'engines': {'node': '>=24.1.3'},
    }
    (tmp_path / 'package.json').write_text(json.dumps(package))
    (tmp_path / 'pnpm-workspace.yaml').write_text(
        '# repository policy\nminimumReleaseAge: 1440\ncatalogs:\n  user:\n    other: "^2.0.0"\n'
    )
    for file, content in project.dependency_plan(tmp_path, manifest).items():
        project.atomic_write(file, content)
    result = project.read_json(tmp_path / 'package.json')
    assert result['scripts'] == package['scripts']
    assert result['dependencies'] == package['dependencies']
    assert result['devDependencies'] == {'react': 'catalog:dara'}
    assert result['engines']['node'].startswith('>=24.1.3')
    assert '# repository policy' in (tmp_path / 'pnpm-workspace.yaml').read_text()
    assert read_yaml(tmp_path / 'pnpm-workspace.yaml')['catalogs']['user'] == {'other': '^2.0.0'}
    assert project.dependency_plan(tmp_path, manifest) == {}


@pytest.mark.parametrize('engine', ['12.2.1', '^12.2.1', '>=12.2.1 <12.2.4'])
def test_compatible_precise_engine_restrictions_are_preserved(tmp_path, manifest, engine):
    (tmp_path / 'package.json').write_text(json.dumps({'engines': {'pnpm': engine}}))
    planned = project.dependency_plan(tmp_path, manifest)
    assert json.loads(planned[tmp_path / 'package.json'])['engines']['pnpm'].startswith(engine)


def test_preflight_conflict_does_not_write_files(tmp_path, manifest):
    file = tmp_path / 'package.json'
    original = json.dumps({'devDependencies': {'react': '^17.0.0'}})
    file.write_text(original)
    with pytest.raises(ProjectError, match='catalog:dara'):
        project.dependency_plan(tmp_path, manifest)
    assert file.read_text() == original
    assert not (tmp_path / 'pnpm-workspace.yaml').exists()


def test_frozen_preparation_never_creates_project_files(tmp_path, manifest, monkeypatch):
    monkeypatch.setattr(project, 'check_toolchain', lambda **kwargs: {})
    run = Mock()
    monkeypatch.setattr(project.subprocess, 'run', run)
    with pytest.raises(ProjectError, match='run dara lock'):
        project.prepare_project(tmp_path, manifest, frozen=True)
    assert not (tmp_path / 'package.json').exists()
    assert not (tmp_path / 'pnpm-workspace.yaml').exists()
    run.assert_not_called()


def test_lockfile_checks_dependency_document_after_pnpm_environment(tmp_path, monkeypatch):
    verify = Mock(return_value=True)
    monkeypatch.setattr(project, 'verify_lockfile', verify)
    (tmp_path / 'package.json').write_text(json.dumps({'devDependencies': {'react': 'catalog:dara'}}))
    (tmp_path / 'pnpm-workspace.yaml').write_text('catalogs:\n  dara:\n    react: ^18.3.0\n')
    lock = "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies: {}\n---\nlockfileVersion: '9.0'\ncatalogs:\n  dara:\n    react:\n      specifier: ^18.3.0\n      version: 18.3.1\nimporters:\n  .:\n    devDependencies:\n      react:\n        specifier: catalog:dara\n        version: 18.3.1\n"
    (tmp_path / 'pnpm-lock.yaml').write_text(lock)
    assert project.lockfile_agrees(tmp_path)
    verify.assert_called_once()
    (tmp_path / 'package.json').write_text(json.dumps({'devDependencies': {'react': '^18.3.0'}}))
    verify.return_value = False
    assert not project.lockfile_agrees(tmp_path)


def test_plugin_environment_excludes_registry_and_unrelated_secrets(monkeypatch):
    monkeypatch.setenv('NPM_TOKEN', 'private-registry-token')
    monkeypatch.setenv('DATABASE_PASSWORD', 'private-database-password')
    monkeypatch.setenv('VITE_PUBLIC_VALUE', 'public')
    monkeypatch.setenv('https_proxy', 'http://proxy.test')
    environment = project.runner_environment()
    assert 'NPM_TOKEN' not in environment
    assert 'DATABASE_PASSWORD' not in environment
    assert environment['VITE_PUBLIC_VALUE'] == 'public'
    assert environment['https_proxy'] == 'http://proxy.test'


def test_toolchain_diagnostic_names_required_range(monkeypatch):
    monkeypatch.setattr(
        project.subprocess, 'run', lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, stdout='v22.11.0\n')
    )
    with pytest.raises(ProjectError) as caught:
        project.check_toolchain()
    assert caught.value.diagnostic.code == 'toolchain.node'
    assert '>=22.12.0' in caught.value.diagnostic.fix


def test_configuration_reference_comes_from_pyproject_with_override(tmp_path):
    (tmp_path / 'pyproject.toml').write_text('[tool.dara]\nconfig = "project.pages:application"\n')
    assert project.resolve_config(tmp_path) == 'project.pages:application'
    assert project.resolve_config(tmp_path, 'override:config') == 'override:config'


@pytest.mark.parametrize(
    ('filename', 'malformed', 'field'),
    [
        ('package.json', '{"devDependencies": []}', 'devDependencies'),
        ('package.json', '{"dependencies": null}', 'dependencies'),
        ('package.json', '{"optionalDependencies": false}', 'optionalDependencies'),
        ('package.json', '{"devDependencies": {"react": 123}}', 'devDependencies.react'),
        ('package.json', '{"dependencies": {"user-package": null}}', 'dependencies.user-package'),
        ('package.json', '{"engines": null}', 'engines'),
        ('package.json', '{"engines": {"node": 22}}', 'engines.node'),
        ('package.json', '{"name": []}', 'name'),
        ('pnpm-workspace.yaml', '[]', 'expected a mapping'),
        ('pnpm-workspace.yaml', 'catalogs: null', 'catalogs'),
        ('pnpm-workspace.yaml', 'catalogs:\n  dara: []', 'catalogs.dara'),
        ('pnpm-workspace.yaml', 'catalogs:\n  dara:\n    react: 18', 'catalogs.dara.react'),
        ('pnpm-workspace.yaml', 'catalogs: [', 'pnpm-workspace.yaml'),
        ('pnpm-lock.yaml', '', 'expected a dependency lock document'),
        ('pnpm-lock.yaml', '# unfinished edit\n', 'expected a dependency lock document'),
        ('pnpm-lock.yaml', '[]', 'valid dictionary'),
        ('pnpm-lock.yaml', 'importers: null', 'importers'),
        ('pnpm-lock.yaml', 'importers:\n  .: []', 'importers..'),
        ('pnpm-lock.yaml', 'importers:\n  .:\n    devDependencies: []', 'devDependencies'),
        ('pnpm-lock.yaml', 'importers:\n  .:\n    devDependencies:\n      react: 123', 'react'),
        ('pnpm-lock.yaml', 'importers:\n  .:\n    devDependencies:\n      react: {}', 'specifier'),
        ('pnpm-lock.yaml', 'importers:\n  .:\n    devDependencies:\n      react:\n        specifier: 18', 'specifier'),
        ('pnpm-lock.yaml', 'catalogs: null', 'catalogs'),
        ('pnpm-lock.yaml', 'catalogs:\n  dara:\n    react: null', 'catalogs.dara.react'),
        ('pnpm-lock.yaml', 'importers: [', 'pnpm-lock.yaml'),
    ],
)
def test_preparation_reports_input_errors_and_recovers_after_correction(
    tmp_path, manifest, monkeypatch, filename, malformed, field
):
    for path, content in project.dependency_plan(tmp_path, manifest).items():
        path.write_text(content)
    (tmp_path / 'pnpm-lock.yaml').write_text(
        "lockfileVersion: '9.0'\n"
        'catalogs:\n  dara:\n    react:\n      specifier: ^18.3.0\n      version: 18.3.1\n'
        'importers:\n  .:\n    devDependencies:\n      react:\n        specifier: catalog:dara\n        version: 18.3.1\n'
    )
    original = {path: path.read_text() for path in tmp_path.iterdir()}
    malformed_path = tmp_path / filename
    malformed_path.write_text(malformed)
    monkeypatch.setattr(project, 'check_toolchain', lambda **kwargs: {})
    run = Mock(return_value=subprocess.CompletedProcess([], 0, stdout='', stderr=''))
    plugin = Mock(return_value=subprocess.CompletedProcess([], 0, stdout='{"created": []}', stderr=''))
    monkeypatch.setattr(project.subprocess, 'run', run)
    monkeypatch.setattr(project, 'run_plugin', plugin)

    with pytest.raises(ProjectError) as caught:
        project.prepare_project(tmp_path, manifest)
    assert caught.value.diagnostic.code == 'project.file'
    assert str(malformed_path) in caught.value.diagnostic.message
    assert field in caught.value.diagnostic.message
    assert caught.value.diagnostic.fix == f'edit {malformed_path}'
    run.assert_not_called()
    plugin.assert_not_called()
    assert not (tmp_path / 'node_modules/.dara/installed.json').exists()
    for path, content in original.items():
        assert path.read_text() == (malformed if path == malformed_path else content)

    malformed_path.write_text(original[malformed_path])
    assert project.prepare_project(tmp_path, manifest) == []
    plugin.assert_called_once()
    assert (tmp_path / 'node_modules/.dara/installed.json').is_file()


@pytest.mark.parametrize('contents', ['tool = []', '[tool]\ndara = 123', '[tool.dara]\nconfig = false'])
def test_configuration_rejects_malformed_nested_fields(tmp_path, contents):
    path = tmp_path / 'pyproject.toml'
    path.write_text(contents)
    with pytest.raises(ProjectError) as caught:
        project.resolve_config(tmp_path)
    assert str(path) in caught.value.diagnostic.message
    assert caught.value.diagnostic.fix == f'edit {path}'


def test_preparing_one_workspace_app_keeps_catalog_entries_used_by_another(tmp_path, manifest, workspace_members):
    workspace = tmp_path
    app = workspace / 'apps/a'
    other = workspace / 'apps/b'
    app.mkdir(parents=True)
    other.mkdir(parents=True)
    workspace_members(app, other)
    (workspace / 'pnpm-workspace.yaml').write_text(
        'packages: ["apps/*"]\ncatalogs:\n  dara:\n    widgets: ^1.0.0\n    unused: ^2.0.0\n'
    )
    (other / 'package.json').write_text(json.dumps({'name': 'b', 'dependencies': {'widgets': 'catalog:dara'}}))
    for file, content in project.dependency_plan(app, manifest).items():
        project.atomic_write(file, content)
    catalog = read_yaml(workspace / 'pnpm-workspace.yaml')['catalogs']['dara']
    assert catalog == {'widgets': '^1.0.0', 'react': '^18.3.0'}
    assert not project.dependency_plan(app, manifest)


def test_workspace_dara_version_conflict_names_both_apps_before_writing(tmp_path, manifest, workspace_members):
    app = tmp_path / 'apps/a'
    other = tmp_path / 'apps/b'
    app.mkdir(parents=True)
    other.mkdir(parents=True)
    workspace_members(app, other)
    (tmp_path / 'pnpm-workspace.yaml').write_text('packages: ["apps/*"]\n')
    (other / 'package.json').write_text(
        json.dumps({'name': 'b', 'devDependencies': {'@darajs/vite-plugin': 'catalog:dara'}})
    )
    metadata = other / '.venv/lib/python3.11/site-packages/dara_core-1.0.0.dist-info'
    metadata.mkdir(parents=True)
    (metadata / 'METADATA').write_text('Metadata-Version: 2.1\nName: dara-core\nVersion: 1.0.0\n')
    with pytest.raises(ProjectError, match='All apps sharing') as error:
        project.dependency_plan(app, manifest)
    assert str(app) in str(error.value) and str(other) in str(error.value)
    assert not (app / 'package.json').exists()
    (metadata / 'METADATA').write_text('Metadata-Version: 2.1\nName: dara-core\nVersion: 2.0.0\n')
    assert project.dependency_plan(app, manifest)


@pytest.mark.parametrize('app_at_workspace_root', [False, True])
def test_workspace_library_dependency_edit_changes_the_install_fingerprint(
    tmp_path, app_at_workspace_root, workspace_members
):
    app = tmp_path if app_at_workspace_root else tmp_path / 'app'
    library = tmp_path / 'library'
    app.mkdir(exist_ok=True)
    library.mkdir()
    workspace_members(app, library)
    (tmp_path / 'pnpm-workspace.yaml').write_text('packages: ["*"]\n')
    (app / 'package.json').write_text('{"name":"app"}')
    file = library / 'package.json'
    file.write_text('{"name":"library","dependencies":{}}')
    before = project.dependency_fingerprint(app)
    file.write_text('{"name":"library","dependencies":{"new":"^1.0.0"}}')
    assert project.dependency_fingerprint(app) != before
