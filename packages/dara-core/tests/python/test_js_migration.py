"""Automatic migration handles project settings; source and script edits belong to agents."""

import json
import stat
from pathlib import Path
from unittest.mock import patch

import pytest

from click.testing import CliRunner
from dara.core.cli import cli
from dara.core.js_tooling import migration
from dara.core.js_tooling.models import ProjectError


def legacy(root: Path, **settings):
    """Write the small legacy configuration accepted by ordinary preparation."""
    path = root / 'dara.config.json'
    path.write_text(json.dumps({'local_entry': './js', 'extra_dependencies': {'example': '^1'}, **settings}))
    return path


def snapshot(root: Path):
    return {path.relative_to(root): path.read_bytes() for path in root.rglob('*') if path.is_file()}


def test_configuration_conversion_preserves_sources_scripts_and_unrelated_package_fields(tmp_path, capsys, monkeypatch):
    legacy(tmp_path, package_manager='yarn')
    package = tmp_path / 'package.json'
    package.write_text('{"name":"app","scripts":{"dev":"dara start --reload"},"private":true,"custom":42}')
    package.chmod(0o640)
    preserved = {
        'main.py': "class Chart:\n    js_source = './js/chart.tsx'\n",
        'pyproject.toml': '[tool.dara]\nconfig="main:config"\n',
        'dev.sh': 'dara start --reload --enable-hmr\n',
        'yarn.lock': '# retained for review\n',
    }
    for name, content in preserved.items():
        (tmp_path / name).write_text(content)
    monkeypatch.setenv('PATH', '')
    migration.migrate_legacy_config(tmp_path)
    assert json.loads(package.read_text()) == {
        'name': 'app',
        'scripts': {'dev': 'dara start --reload'},
        'private': True,
        'custom': 42,
        'dependencies': {'example': '^1'},
    }
    assert stat.S_IMODE(package.stat().st_mode) == 0o640
    assert not (tmp_path / 'dara.config.json').exists()
    for name, content in preserved.items():
        assert (tmp_path / name).read_text() == content
    output = capsys.readouterr().err
    assert 'Legacy Dara configuration detected' in output
    assert 'Migrated legacy configuration' in output
    assert 'yarn.lock is preserved' in output
    before = snapshot(tmp_path)
    assert migration.migrate_legacy_config(tmp_path) == []
    assert snapshot(tmp_path) == before
    assert capsys.readouterr().err == ''


def test_missing_package_manifest_receives_legacy_dependencies(tmp_path):
    legacy(tmp_path)
    migration.migrate_legacy_config(tmp_path)
    package = json.loads((tmp_path / 'package.json').read_text())
    assert package['dependencies'] == {'example': '^1'}
    assert package['private'] is True
    assert package['type'] == 'module'


@pytest.mark.parametrize('section', ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])
def test_matching_existing_requirement_is_not_duplicated_or_reformatted(tmp_path, section):
    legacy(tmp_path)
    package = tmp_path / 'package.json'
    before = json.dumps({section: {'example': '^1'}}, separators=(',', ':')).encode()
    package.write_bytes(before)
    migration.migrate_legacy_config(tmp_path)
    assert package.read_bytes() == before


@pytest.mark.parametrize('section', ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])
def test_dependency_conflicts_change_nothing(tmp_path, section):
    legacy(tmp_path)
    (tmp_path / 'package.json').write_text(json.dumps({section: {'example': '^2'}}))
    before = snapshot(tmp_path)
    with pytest.raises(ProjectError, match='package.json has') as error:
        migration.migrate_legacy_config(tmp_path)
    assert 'dara-2-migration' in error.value.diagnostic.fix
    assert snapshot(tmp_path) == before


@pytest.mark.parametrize(
    'settings',
    [
        {'local_entry': './frontend'},
        {'package_manager': 'custom'},
        {'extra_dependencies': []},
        {'custom_setting': True},
    ],
)
def test_custom_configuration_is_left_for_the_skill(tmp_path, settings):
    legacy(tmp_path, **settings)
    before = snapshot(tmp_path)
    with pytest.raises(ProjectError) as error:
        migration.migrate_legacy_config(tmp_path)
    assert error.value.diagnostic.code == 'migration.manual'
    assert 'skills/dara-2-migration' in error.value.diagnostic.fix
    assert snapshot(tmp_path) == before


@pytest.mark.parametrize('name', ['dara.config.json', 'package.json'])
@pytest.mark.parametrize('content', ['[]', '{broken', 'null', ''])
def test_malformed_documents_are_not_replaced(tmp_path, name, content):
    legacy(tmp_path)
    (tmp_path / name).write_text(content)
    before = snapshot(tmp_path)
    with pytest.raises(ProjectError):
        migration.migrate_legacy_config(tmp_path)
    assert snapshot(tmp_path) == before


def test_frozen_preparation_reports_migration_without_writing(tmp_path, capsys):
    legacy(tmp_path)
    before = snapshot(tmp_path)
    with pytest.raises(ProjectError) as error:
        migration.migrate_legacy_config(tmp_path, frozen=True)
    assert error.value.diagnostic.code == 'migration.required'
    assert snapshot(tmp_path) == before
    assert capsys.readouterr().err == ''


@pytest.mark.parametrize('name', ['package.json', 'dara.config.json'])
def test_linked_configuration_is_not_replaced(tmp_path, name):
    legacy(tmp_path)
    target = tmp_path / 'owned-elsewhere.json'
    target.write_text('{}')
    (tmp_path / name).unlink(missing_ok=True)
    (tmp_path / name).symlink_to(target)
    with pytest.raises(ProjectError, match='app-owned file'):
        migration.migrate_legacy_config(tmp_path)
    assert target.read_text() == '{}'
    assert (tmp_path / name).is_symlink()


def test_interrupted_copy_preserves_configuration_and_can_be_retried(tmp_path, capsys):
    path = legacy(tmp_path)
    with (
        patch.object(migration.os, 'replace', side_effect=OSError('interrupted')),
        pytest.raises(ProjectError, match='interrupted'),
    ):
        migration.migrate_legacy_config(tmp_path)
    assert path.exists()
    assert not (tmp_path / 'package.json').exists()
    assert 'Migrated legacy configuration' not in capsys.readouterr().err
    migration.migrate_legacy_config(tmp_path)
    assert json.loads((tmp_path / 'package.json').read_text())['dependencies'] == {'example': '^1'}
    assert not path.exists()


def test_concurrent_edit_after_copy_retains_the_changed_legacy_file(tmp_path):
    path = legacy(tmp_path)
    replace = migration._replace

    def edit_during_copy(*args):
        replace(*args)
        path.write_text('{"extra_dependencies":{"example":"^2"}}')

    with (
        patch.object(migration, '_replace', side_effect=edit_during_copy),
        pytest.raises(ProjectError, match='changed during migration'),
    ):
        migration.migrate_legacy_config(tmp_path)
    assert json.loads(path.read_text())['extra_dependencies'] == {'example': '^2'}
    assert json.loads((tmp_path / 'package.json').read_text())['dependencies'] == {'example': '^1'}


def test_lock_requires_source_migration_before_any_configuration_edits(tmp_path, monkeypatch):
    legacy(tmp_path)
    (tmp_path / 'pyproject.toml').write_text('[tool.dara]\nconfig="legacy_source:config"\n')
    (tmp_path / 'legacy_source.py').write_text(
        'from dara.core import ComponentInstance, ConfigurationBuilder\n'
        'class Chart(ComponentInstance):\n    js_module = None\n'
        'config = ConfigurationBuilder()\n'
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.syspath_prepend(str(tmp_path))
    before = snapshot(tmp_path)
    with patch('dara.core.cli.prepare_project') as prepare:
        result = CliRunner().invoke(cli, ['lock'])
    assert result.exit_code != 0
    assert 'dara-2-migration' in str(result.exception.__cause__)
    prepare.assert_not_called()
    after = snapshot(tmp_path)
    assert all(after[path] == content for path, content in before.items())
    assert not (tmp_path / 'package.json').exists()
