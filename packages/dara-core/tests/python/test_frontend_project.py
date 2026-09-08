"""Contracts shared by preparation, the Vite runner and artifact-only runtime."""

import json
import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest

from dara.core.base_definitions import ActionImpl, AssetManifest, StaticAsset
from dara.core.definitions import ComponentInstance
from dara.core.internal.import_discovery import create_action_definition, create_component_definition
from dara.core.js_tooling import project
from dara.core.js_tooling.models import FrontendManifest, ProjectError, Requirement
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
    assert project.read_yaml(tmp_path / 'pnpm-workspace.yaml')['catalogs']['user'] == {'other': '^2.0.0'}
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
    monkeypatch.setattr(project, 'check_toolchain', lambda: {})
    run = Mock()
    monkeypatch.setattr(project.subprocess, 'run', run)
    with pytest.raises(ProjectError, match='run dara lock'):
        project.prepare_project(tmp_path, manifest, frozen=True)
    assert not (tmp_path / 'package.json').exists()
    assert not (tmp_path / 'pnpm-workspace.yaml').exists()
    run.assert_not_called()


def test_lockfile_checks_dependency_document_after_pnpm_environment(tmp_path):
    (tmp_path / 'package.json').write_text(json.dumps({'devDependencies': {'react': 'catalog:dara'}}))
    (tmp_path / 'pnpm-workspace.yaml').write_text('catalogs:\n  dara:\n    react: ^18.3.0\n')
    lock = "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies: {}\n---\nlockfileVersion: '9.0'\ncatalogs:\n  dara:\n    react:\n      specifier: ^18.3.0\n      version: 18.3.1\nimporters:\n  .:\n    devDependencies:\n      react:\n        specifier: catalog:dara\n        version: 18.3.1\n"
    (tmp_path / 'pnpm-lock.yaml').write_text(lock)
    assert project.lockfile_agrees(tmp_path)
    (tmp_path / 'package.json').write_text(json.dumps({'devDependencies': {'react': '^18.3.0'}}))
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
