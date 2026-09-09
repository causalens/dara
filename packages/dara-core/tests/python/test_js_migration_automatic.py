"""Lock and development migrate complete plans before importing legacy application code."""

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from click.testing import CliRunner
from dara.core.cli import cli
from dara.core.js_tooling.migration import migrate_before_prepare, plan_migration
from dara.core.js_tooling.migration_analyzer import analyzer_command as select_analyzer
from dara.core.js_tooling.models import ProjectError

pytestmark = pytest.mark.usefixtures('migration_analyzer')


@pytest.fixture(autouse=True)
def isolated_environment():
    """Restore the serving command's process environment before another test runs."""
    with patch.dict(os.environ):
        yield


def project(root: Path):
    (root / 'js').mkdir()
    (root / 'js/index.tsx').write_text('export { Counter } from "./counter";')
    (root / 'js/counter.tsx').write_text('export const Counter = () => <div/>;')
    (root / 'dara.config.json').write_text(json.dumps({'local_entry': './js'}))
    (root / 'main.py').write_text("""from dara.core import ComponentInstance, ConfigurationBuilder
config = ConfigurationBuilder()
class Counter(ComponentInstance):
    js_module = None
    js_component = "Counter"
config.add_component(Counter, local=True)
""")


def contents(root: Path):
    return {str(path.relative_to(root)): path.read_bytes() for path in root.rglob('*') if path.is_file()}


def test_lock_migrates_before_importing_configuration(tmp_path, monkeypatch, capsys):
    project(tmp_path)
    (tmp_path / 'yarn.lock').write_text('# legacy lockfile\n')
    monkeypatch.chdir(tmp_path)

    def manifest(config):
        assert 'js_source' in (tmp_path / 'main.py').read_text()
        assert not (tmp_path / 'dara.config.json').exists()
        return tmp_path, object()

    with patch('dara.core.cli._manifest', side_effect=manifest), patch('dara.core.cli.prepare_project') as prepare:
        result = CliRunner().invoke(cli, ['lock'])
    assert result.exception is None, result.output
    prepare.assert_called_once()
    assert 'Legacy Dara configuration detected; applying automatic migration.' in result.stderr
    assert 'Migrated' in result.stderr
    assert 'review git diff and commit' in result.stderr
    assert 'Migration note: yarn.lock is preserved.' in result.stderr
    assert not migrate_before_prepare(tmp_path)
    assert capsys.readouterr().err == ''


def test_dev_migrates_before_resolving_configuration(tmp_path, monkeypatch):
    project(tmp_path)
    monkeypatch.chdir(tmp_path)
    with patch('dara.core.cli.check_toolchain'), patch('dara.core.cli.supervise') as supervise:
        result = CliRunner().invoke(cli, ['dev', '--disable-metrics'])
    assert result.exception is None, result.output
    assert supervise.call_args.args[1] == 'main:config'
    assert 'js_source' in (tmp_path / 'main.py').read_text()


@pytest.mark.parametrize('command', [['lock'], ['dev', '--disable-metrics']])
def test_unresolved_automatic_migration_changes_nothing_and_never_imports(tmp_path, monkeypatch, command):
    project(tmp_path)
    (tmp_path / 'js/index.tsx').write_text('const Counter = () => null; export { Counter };')
    monkeypatch.chdir(tmp_path)
    before = contents(tmp_path)
    with patch('dara.core.cli._manifest') as manifest, patch('dara.core.cli.supervise') as supervise:
        result = CliRunner().invoke(cli, command)
    assert result.exit_code == 1
    assert 'migration.manual' in result.output
    assert 'applying automatic migration' not in result.output
    assert 'Migrated' not in result.output
    assert 'js_source' in result.output
    assert str(tmp_path / 'main.py') in result.output
    assert contents(tmp_path) == before
    manifest.assert_not_called()
    supervise.assert_not_called()


def test_frozen_dev_reports_migration_without_invoking_tools(tmp_path, monkeypatch):
    project(tmp_path)
    monkeypatch.chdir(tmp_path)
    before = contents(tmp_path)
    with patch('dara.core.js_tooling.migration_analyzer.analyzer_command') as command:
        result = CliRunner().invoke(cli, ['dev', '--frozen', '--disable-metrics'])
    assert result.exit_code == 1
    assert 'without frozen mode' in result.output
    assert 'applying automatic migration' not in result.output
    assert 'Migrated' not in result.output
    command.assert_not_called()
    assert contents(tmp_path) == before


def test_new_resolver_candidate_invalidates_the_plan_before_writing(tmp_path):
    project(tmp_path)
    plan = plan_migration(tmp_path)
    assert not plan.issues
    (tmp_path / 'js/counter.js').write_text('export const Counter = () => null;')
    assert plan.apply() == []
    assert any('Resolver directory changed' in issue.message for issue in plan.issues)
    assert (tmp_path / 'dara.config.json').exists()


def test_inherited_config_change_invalidates_the_plan_before_writing(tmp_path):
    project(tmp_path)
    (tmp_path / 'tsconfig.json').write_text('{"extends":"./base.json"}')
    base = tmp_path / 'base.json'
    base.write_text('{"compilerOptions":{"allowImportingTsExtensions":true}}')
    plan = plan_migration(tmp_path)
    assert not plan.issues
    base.write_text('{"compilerOptions":{"allowImportingTsExtensions":false}}')
    assert plan.apply() == []
    assert any(issue.path == base and 'changed during migration' in issue.message for issue in plan.issues)


def test_missing_preset_reports_its_name_without_applying_an_adapter(tmp_path):
    project(tmp_path)
    (tmp_path / 'tsconfig.json').write_text('{"extends":"missing-preset"}')
    before = contents(tmp_path)
    with pytest.raises(ProjectError, match='missing-preset'):
        migrate_before_prepare(tmp_path)
    assert contents(tmp_path) == before


def test_analyzer_uses_only_the_matching_installed_tool(tmp_path):
    package = tmp_path / 'node_modules/@darajs/vite-plugin'
    (package / 'dist').mkdir(parents=True)
    executable = package / 'dist/cli.js'
    executable.write_text('')
    manifest = package / 'package.json'
    with patch('dara.core.js_tooling.migration_analyzer.check_toolchain'):
        manifest.write_text('{"name":"@darajs/vite-plugin","version":"2.0.0"}')
        assert select_analyzer(tmp_path, '2.0.0') == ['node', str(executable), 'analyze-migration']
        manifest.write_text('{"name":"@darajs/vite-plugin","version":"1.0.0"}')
        assert select_analyzer(tmp_path, '2.0.0') == [
            'pnpm',
            '--silent',
            '--ignore-workspace',
            '--package=@darajs/vite-plugin@2.0.0',
            'dlx',
            'dara-vite',
            'analyze-migration',
        ]


def test_migration_announces_writes_without_claiming_success_on_conflict(tmp_path, monkeypatch, capsys):
    """Users see an advance notice, but interrupted migrations never report completion."""
    project(tmp_path)
    plan = plan_migration(tmp_path)
    apply = plan.apply

    def conflicting_apply():
        assert 'applying automatic migration' in capsys.readouterr().err
        assert (tmp_path / 'dara.config.json').exists()
        (tmp_path / 'main.py').write_text('# concurrent edit\n')
        return apply()

    monkeypatch.setattr(plan, 'apply', conflicting_apply)
    with patch('dara.core.js_tooling.migration.plan_migration', return_value=plan):
        with pytest.raises(ProjectError, match='changed during migration'):
            migrate_before_prepare(tmp_path)
    assert 'Migrated' not in capsys.readouterr().err
    assert (tmp_path / 'dara.config.json').exists()
