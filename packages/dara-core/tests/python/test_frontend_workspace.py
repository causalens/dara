"""Shared workspace preparation preserves membership, versions and install freshness."""

import json
import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest

from dara.core import ComponentInstance, ConfigurationBuilder
from dara.core.js_tooling import project, workspace
from dara.core.js_tooling.models import FrontendManifest, ProjectError, Requirement
from dara.core.js_tooling.project_files import InstalledProjectFields, PreparedRequirements, read_yaml


def manifest(*, dara='2.0.0', widgets='1.0.0'):
    return FrontendManifest(
        configuration='app:config',
        dara_version=dara,
        package_requirements=[
            Requirement(name='@darajs/vite-plugin', specifier='^' + dara),
            Requirement(name='widgets', specifier='^' + widgets),
            Requirement(name='react', specifier='^18.3.0'),
        ],
        python_packages={'@darajs/vite-plugin': 'dara.core', 'widgets': 'widget-distribution'},
        module_dependencies=[],
        components=[],
        actions=[],
        out_dir='dist',
    )


def metadata(environment: Path, *, dara='2.0.0', widgets='1.0.0'):
    for name, version in [('dara-core', dara), ('widget-distribution', widgets)]:
        directory = environment / f'lib/python3.11/site-packages/{name.replace("-", "_")}.dist-info'
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'METADATA').write_text(f'Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n')


def prepared(root: Path, requirements: FrontendManifest, environment: Path):
    path = root / 'node_modules/.dara/installed.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        InstalledProjectFields(
            digest='previous',
            pythonEnvironment=str(environment),
            requirements=PreparedRequirements.from_manifest(requirements),
        ).model_dump_json()
    )


@pytest.fixture
def apps(tmp_path, monkeypatch):
    a, b = tmp_path / 'apps/a', tmp_path / 'apps/b'
    for app in (a, b):
        app.mkdir(parents=True)
        (app / 'package.json').write_text(
            json.dumps(
                {
                    'name': app.name,
                    'devDependencies': {
                        '@darajs/vite-plugin': 'catalog:dara',
                        'widgets': 'catalog:dara',
                        'react': 'catalog:dara',
                    },
                }
            )
        )
    (tmp_path / 'pnpm-workspace.yaml').write_text(
        'packages: ["apps/*"]\ncatalogs:\n  dara:\n    "@darajs/vite-plugin": ^2.0.0\n    widgets: ^1.0.0\n    react: ^18.3.0\n'
    )
    monkeypatch.setattr(workspace, '_query_members', lambda root, processes=None: (a, b))
    return a, b


def test_recorded_active_environment_takes_precedence_over_unused_venv(apps):
    a, b = apps
    actual = b.parent.parent / 'environments/active-b'
    metadata(b / '.venv', dara='1.0.0')
    metadata(actual)
    prepared(b, manifest(), actual)
    assert project.dependency_plan(a, manifest())


def test_same_dara_version_does_not_allow_conflicting_addon_requirements(apps):
    a, b = apps
    metadata(b / '.venv')
    prepared(b, manifest(), b / '.venv')
    original = (a.parent.parent / 'pnpm-workspace.yaml').read_bytes()
    with pytest.raises(ProjectError) as error:
        project.dependency_plan(a, manifest(widgets='2.0.0'))
    assert error.value.diagnostic.code == 'workspace.requirement'
    assert str(a) in str(error.value) and str(b) in str(error.value)
    assert 'widgets' in str(error.value) and '^1.0.0' in str(error.value) and '^2.0.0' in str(error.value)
    assert (a.parent.parent / 'pnpm-workspace.yaml').read_bytes() == original


@pytest.mark.parametrize('upgrade_dara', [False, True])
def test_synchronized_upgrades_refresh_stale_records_without_lock_deadlock(apps, upgrade_dara):
    a, b = apps
    old = manifest()
    new = manifest(dara='3.0.0' if upgrade_dara else '2.0.0', widgets='2.0.0')
    for app in (a, b):
        prepared(app, old, app / '.venv')
        metadata(app / '.venv', dara=new.dara_version, widgets='2.0.0')
    for app in (a, b):
        for path, text in project.dependency_plan(app, new).items():
            path.write_text(text)
        prepared(app, new, app / '.venv')
    for app in (a, b):
        assert project.dependency_plan(app, new) == {}
    catalog = read_yaml(a.parent.parent / 'pnpm-workspace.yaml')['catalogs']['dara']
    assert catalog['widgets'] == '^2.0.0'


@pytest.mark.parametrize('malformed', [None, [], {'widgets': 42}])
def test_sibling_dependency_boundaries_report_the_source_field(apps, malformed):
    a, b = apps
    path = b / 'package.json'
    path.write_text(json.dumps({'name': 'b', 'dependencies': malformed}))
    with pytest.raises(ProjectError) as error:
        project.dependency_plan(a, manifest())
    assert error.value.diagnostic.code == 'project.file'
    assert str(path) in str(error.value)
    assert 'dependencies' in str(error.value)


def test_excluded_apps_and_malformed_nonmembers_cannot_affect_the_catalog(apps, monkeypatch):
    a, b = apps
    root = a.parent.parent
    (root / 'pnpm-workspace.yaml').write_text('packages: ["apps/*", "!apps/b"]\n')
    metadata(b / '.venv', dara='1.0.0')
    (b / 'package.json').write_text('{broken nonmember JSON')
    monkeypatch.setattr(workspace, '_query_members', lambda root, processes=None: (a,))
    assert project.dependency_plan(a, manifest())


def test_preparing_an_excluded_app_never_replaces_its_package(apps, monkeypatch):
    a, b = apps
    monkeypatch.setattr(workspace, '_query_members', lambda root, processes=None: (b,))
    before = (a / 'package.json').read_bytes()
    with pytest.raises(ProjectError) as error:
        project.dependency_plan(a, manifest())
    assert error.value.diagnostic.code == 'workspace.member'
    assert (a / 'package.json').read_bytes() == before


def test_membership_cache_reuses_pnpm_but_tracks_additions_deletions_and_pattern_edits(apps, monkeypatch):
    a, b = apps
    root = a.parent.parent
    members = [a, b]
    query = Mock(side_effect=lambda root, processes=None: tuple(members))
    monkeypatch.setattr(workspace, '_query_members', query)
    first = project.dependency_fingerprint(a)
    assert project.dependency_fingerprint(a) == first
    assert query.call_count == 1
    (b / 'package.json').write_text('{"name":"b","dependencies":{"new":"^1"}}')
    assert project.dependency_fingerprint(a) != first
    assert query.call_count == 1
    c = root / 'apps/c'
    c.mkdir()
    (c / 'package.json').write_text('{"name":"c"}')
    members.append(c)
    project.dependency_fingerprint(a)
    assert query.call_count == 2
    (c / 'package.json').unlink()
    members.remove(c)
    project.dependency_fingerprint(a)
    assert query.call_count == 3
    (root / 'pnpm-workspace.yaml').write_text('packages: ["apps/{a,b}"]\n')
    project.dependency_fingerprint(a)
    assert query.call_count == 4


def test_root_member_and_visible_dots_do_not_scan_python_environments(apps, monkeypatch):
    a, b = apps
    root = a.parent.parent
    environment = root / '.venv/lib/python3.11/site-packages'
    environment.mkdir(parents=True)
    (environment / 'package.json').write_text('{"name":"not-a-workspace-member"}')
    (root / 'pnpm-workspace.yaml').write_text('packages: [".", "apps/*", "visible.name/*", "!.venv/**"]\n')
    visited = []
    walk = workspace.os.walk

    def track(*args, **kwargs):
        for directory, children, files in walk(*args, **kwargs):
            visited.append(Path(directory))
            yield directory, children, files

    monkeypatch.setattr(workspace.os, 'walk', track)
    first = project.dependency_fingerprint(a)
    assert project.dependency_fingerprint(a) == first
    assert not any(path.is_relative_to(root / '.venv') for path in visited)


def test_explicit_hidden_package_addition_invalidates_membership(apps, monkeypatch):
    a, b = apps
    root = a.parent.parent
    (root / 'pnpm-workspace.yaml').write_text('packages: [".", "apps/*", "./.hidden/*"]\n')
    members = [a, b]
    query = Mock(side_effect=lambda root, processes=None: tuple(members))
    monkeypatch.setattr(workspace, '_query_members', query)
    before = project.dependency_fingerprint(a)
    hidden = root / '.hidden/added'
    hidden.mkdir(parents=True)
    (hidden / 'package.json').write_text('{"name":"added"}')
    members.append(hidden)
    assert project.dependency_fingerprint(a) != before
    assert query.call_count == 2


def test_pnpm_query_uses_uninstalled_declared_members_and_preserves_files(tmp_path, monkeypatch):
    a = tmp_path / 'vendor/a'
    a.mkdir(parents=True)
    (a / 'package.json').write_text('{"name":"a"}')
    configuration = tmp_path / 'pnpm-workspace.yaml'
    configuration.write_text('packages: ["{apps,vendor}/*", "!apps/excluded"]\n')
    run = Mock(return_value=subprocess.CompletedProcess([], 0, stdout=json.dumps([{'path': str(a)}]), stderr=''))
    monkeypatch.setattr(workspace.subprocess, 'run', run)
    original = configuration.read_bytes()
    snapshot = workspace.read_workspace(a)
    assert set(snapshot.projects) == {a}
    assert run.call_args.args[0] == ['pnpm', '--silent', '--recursive', 'list', '--depth', '-1', '--json']
    assert not (tmp_path / 'node_modules').exists()
    assert configuration.read_bytes() == original


def test_workspace_library_drift_uses_a_mutable_install_with_the_braced_scope(tmp_path, monkeypatch):
    verify = Mock(return_value=True)
    monkeypatch.setattr(project, 'verify_lockfile', verify)
    app, library = tmp_path / 'app', tmp_path / 'library'
    app.mkdir()
    library.mkdir()
    (tmp_path / 'pnpm-workspace.yaml').write_text('packages: ["*"]\n')
    (app / 'package.json').write_text('{"name":"app","dependencies":{"library":"workspace:*"}}')
    (library / 'package.json').write_text('{"name":"library","version":"1.0.0"}')
    monkeypatch.setattr(workspace, '_query_members', lambda root, processes=None: (app, library))
    requirements = manifest().model_copy(update={'package_requirements': [], 'python_packages': {}})
    for path, text in project.dependency_plan(app, requirements).items():
        path.write_text(text)
    (tmp_path / 'pnpm-lock.yaml').write_text(
        "lockfileVersion: '9.0'\nimporters:\n  app:\n    dependencies:\n      library:\n        specifier: workspace:*\n        version: link:../library\n  library: {}\n"
    )
    assert project.lockfile_agrees(app)
    (library / 'package.json').write_text('{"name":"library","version":"1.0.0","dependencies":{"new":"^1.0.0"}}')
    verify.return_value = False
    assert not project.lockfile_agrees(app)
    run = Mock(return_value=subprocess.CompletedProcess([], 0, stdout='', stderr=''))
    monkeypatch.setattr(project, 'check_toolchain', lambda **kwargs: {})
    monkeypatch.setattr(project.subprocess, 'run', run)
    monkeypatch.setattr(
        project, 'run_plugin', lambda *args, **kwargs: subprocess.CompletedProcess([], 0, stdout='', stderr='')
    )
    project.prepare_project(app, requirements)
    assert run.call_args_list[-1].args[0] == [
        'pnpm',
        'install',
        '--no-frozen-lockfile',
        '--fail-if-no-match',
        '--filter',
        '{./app}...',
    ]
    stamp = InstalledProjectFields.parse(project.read_json(app / 'node_modules/.dara/installed.json'), app)
    assert stamp.requirements is not None


def test_python_requirement_ownership_is_not_part_of_portable_runtime_identity():
    original = manifest()
    altered = original.model_copy(update={'python_packages': {'widgets': 'renamed-distribution'}})
    assert original.portable() == altered.portable()


def test_inferred_component_package_keeps_its_python_owner_for_peer_upgrade_checks(tmp_path, monkeypatch):
    class Widget(ComponentInstance):
        __module__ = 'widget_distribution.components'
        js_source = '@widgets/library/widget'

    builder = ConfigurationBuilder()
    builder.add_component(Widget)
    monkeypatch.setattr(project, 'npm_version', lambda package: '2.0.0')
    monkeypatch.setattr(project, 'entry_points', lambda **kwargs: [])
    derived = project.derive_manifest(builder._to_configuration(), tmp_path, 'app:config')
    assert derived.python_packages['@widgets/library'] == 'widget_distribution'
    assert derived.python_packages['@darajs/vite-plugin'] == 'dara.core'
    assert '@widgets/library' not in {entry.package for entry in derived.module_dependencies}
