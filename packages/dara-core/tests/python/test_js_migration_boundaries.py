"""Migration snapshots, project-file boundaries, and interruption recovery."""

import json
import os
from pathlib import Path

import pytest

from dara.core.js_tooling import migration_plan
from dara.core.js_tooling.migration import plan_migration

pytestmark = pytest.mark.usefixtures('migration_analyzer')


def project(root: Path, *, entry='index.tsx'):
    root.mkdir(parents=True, exist_ok=True)
    (root / 'frontend/.setup').mkdir(parents=True)
    (root / f'frontend/{entry}').write_text("import './.setup/theme.css';\nexport { Counter } from './counter';\n")
    (root / 'frontend/.setup/theme.css').write_text('body { color: red; }\n')
    (root / 'frontend/counter.tsx').write_text('export function Counter() { return null; }\n')
    script = root / 'frontend/dev.sh'
    script.write_text('#!/bin/sh\ndara start --reload --enable-hmr\n')
    script.chmod(0o755)
    (root / 'main.py').write_text(
        'from dara.core import ConfigurationBuilder, ComponentInstance\n'
        'config = ConfigurationBuilder()\n'
        'class Counter(ComponentInstance):\n'
        '    js_module = None\n'
        "    js_component = 'Counter'\n"
        'config.add_component(Counter, local=True)\n'
    )
    (root / 'pyproject.toml').write_text('[tool.poetry]\nname = "app"\n')
    (root / 'dara.config.json').write_text(json.dumps({'local_entry': './frontend'}))
    return root


@pytest.mark.parametrize('entry', ['index.tsx', 'index.ts'])
def test_every_interruption_position_can_be_replanned(tmp_path, entry):
    probe = project(tmp_path / 'probe', entry=entry)
    expected = plan_migration(probe)
    assert not expected.issues
    for position in range(len(expected.changes) + 1):
        root = project(tmp_path / str(position), entry=entry)
        interrupted = plan_migration(root)
        interrupted.changes = interrupted.changes[:position]
        interrupted.apply()
        assert not interrupted.issues
        retry = plan_migration(root)
        assert not retry.issues, (position, retry.issues)
        retry.apply()
        assert not retry.issues
        assert not (root / 'dara.config.json').exists()
        assert not any(path.is_file() for path in (root / 'frontend').rglob('*'))
        assert (root / 'js/.setup/theme.css').read_text() == 'body { color: red; }\n'
        assert (root / 'js/dev.sh').read_text() == '#!/bin/sh\ndara dev\n'
        assert (root / 'js/dev.sh').stat().st_mode & 0o777 == 0o755
        assert len(list((root / 'js/dara-adapters').glob('*.ts'))) == 1
        assert not plan_migration(root).changes


@pytest.mark.parametrize('changed', ['main.py', 'frontend/counter.tsx', 'frontend/.setup/theme.css'])
def test_complete_preflight_prevents_any_writes_after_input_changes(tmp_path, changed):
    project(tmp_path)
    plan = plan_migration(tmp_path)
    path = tmp_path / changed
    path.write_text(path.read_text() + '\n')
    assert plan.apply() == []
    assert not (tmp_path / 'js').exists()
    assert (tmp_path / 'dara.config.json').exists()
    assert any(issue.path == path and 'changed during migration' in issue.message for issue in plan.issues)


def test_source_tree_addition_invalidates_the_plan(tmp_path):
    project(tmp_path)
    plan = plan_migration(tmp_path)
    (tmp_path / 'frontend/new.ts').write_text('export default 1;')
    assert plan.apply() == []
    assert not (tmp_path / 'js').exists()
    assert any('Source tree changed' in issue.message for issue in plan.issues)


@pytest.mark.skipif(os.name == 'nt' or os.geteuid() == 0, reason='requires Unix directory permissions')
def test_unreadable_hidden_source_directory_is_not_silently_skipped(tmp_path):
    project(tmp_path)
    directory = tmp_path / 'frontend/.setup'
    directory.chmod(0)
    try:
        plan = plan_migration(tmp_path)
        assert plan.issues
        assert not plan.changes
    finally:
        directory.chmod(0o755)


def test_atomic_write_failure_reports_partial_progress_and_can_resume(tmp_path, monkeypatch):
    project(tmp_path)
    plan = plan_migration(tmp_path)
    replace = migration_plan.os.replace
    calls = 0

    def fail_second(source, destination):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise PermissionError('write denied')
        replace(source, destination)

    monkeypatch.setattr(migration_plan.os, 'replace', fail_second)
    assert len(plan.apply()) == 1
    assert any('write denied' in issue.message and '1 files' in issue.message for issue in plan.issues)
    assert (tmp_path / 'dara.config.json').exists()
    assert not list((tmp_path / 'js').rglob('.*.ts.*'))
    monkeypatch.setattr(migration_plan.os, 'replace', replace)
    retry = plan_migration(tmp_path)
    assert not retry.issues
    retry.apply()
    assert not retry.issues
    assert not (tmp_path / 'dara.config.json').exists()


def test_nested_adapter_symlink_never_writes_outside_app(tmp_path):
    root = project(tmp_path / 'app')
    outside = tmp_path / 'outside'
    outside.mkdir()
    (root / 'js').mkdir()
    (root / 'js/dara-adapters').symlink_to(outside, target_is_directory=True)
    plan = plan_migration(root)
    assert plan.issues
    assert not plan.changes
    assert plan.apply() == []
    assert not list(outside.iterdir())


@pytest.mark.parametrize('relative', ['.linked.ts', '.setup/linked.css'])
def test_links_inside_moved_tree_require_manual_resolution(tmp_path, relative):
    project(tmp_path)
    (tmp_path / 'frontend' / relative).symlink_to(tmp_path / 'main.py')
    plan = plan_migration(tmp_path)
    assert plan.issues
    assert not plan.changes


def test_overlapping_source_and_destination_trees_are_not_moved(tmp_path):
    project(tmp_path)
    (tmp_path / 'js').mkdir()
    (tmp_path / 'frontend').rename(tmp_path / 'js/nested')
    (tmp_path / 'dara.config.json').write_text('{"local_entry": "./js/nested"}')
    plan = plan_migration(tmp_path)
    assert any('Overlapping' in issue.message for issue in plan.issues)
    assert not plan.changes


@pytest.mark.parametrize(
    'section', ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'scripts']
)
def test_malformed_package_sections_have_source_diagnostics(tmp_path, section):
    project(tmp_path)
    (tmp_path / 'dara.config.json').write_text('{"local_entry": "./frontend", "extra_dependencies": {"nanoid": "^3"}}')
    path = tmp_path / 'package.json'
    path.write_text(json.dumps({section: None}))
    plan = plan_migration(tmp_path)
    assert any(issue.path == path and section in issue.message for issue in plan.issues)
    assert not plan.changes


@pytest.mark.parametrize(
    'metadata', ['{"local_entry": null}', '{"extra_dependencies": []}', '{"package_manager": 1}', '']
)
def test_invalid_legacy_fields_are_diagnostics(tmp_path, metadata):
    project(tmp_path)
    path = tmp_path / 'dara.config.json'
    path.write_text(metadata)
    plan = plan_migration(tmp_path)
    assert any(issue.path == path for issue in plan.issues)
    assert not plan.changes


def test_dependency_conflicts_in_any_section_are_preserved(tmp_path):
    project(tmp_path)
    (tmp_path / 'dara.config.json').write_text('{"local_entry": "./frontend", "extra_dependencies": {"nanoid": "^3"}}')
    (tmp_path / 'package.json').write_text('{"dependencies":{"nanoid":"^3"},"optionalDependencies":{"nanoid":"^5"}}')
    plan = plan_migration(tmp_path)
    assert any('nanoid' in issue.message and '^5' in issue.message for issue in plan.issues)
    assert not plan.changes


def test_crlf_python_and_existing_dara_header_preserve_line_endings(tmp_path):
    project(tmp_path)
    for name in ('main.py', 'pyproject.toml'):
        path = tmp_path / name
        text = path.read_text()
        if name == 'pyproject.toml':
            text += '[tool.dara] # keep comment\n'
        path.write_bytes(text.replace('\n', '\r\n').encode())
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    for name in ('main.py', 'pyproject.toml'):
        content = (tmp_path / name).read_bytes()
        assert b'\r\n' in content
        assert b'\n' not in content.replace(b'\r\n', b'')
    assert b'[tool.dara] # keep comment\r\nconfig = "main:config"' in (tmp_path / 'pyproject.toml').read_bytes()


@pytest.mark.parametrize('metadata', ['tool = "bad"', '[tool]\ndara = []', '[tool.dara]\nconfig = ""'])
def test_invalid_python_project_settings_do_not_create_duplicate_tables(tmp_path, metadata):
    project(tmp_path)
    path = tmp_path / 'pyproject.toml'
    path.write_text(metadata)
    plan = plan_migration(tmp_path)
    assert any(issue.path == path for issue in plan.issues)
    assert not plan.changes


def test_standalone_commands_migrate_without_legacy_config_or_declarations(tmp_path):
    (tmp_path / 'dev.sh').write_text('dara start --reload --enable-hmr\n')
    (tmp_path / 'package.json').write_text('{"scripts":{"dev":"dara start --reload --enable-hmr"}}')
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    assert (tmp_path / 'dev.sh').read_text() == 'dara dev\n'
    assert json.loads((tmp_path / 'package.json').read_text()) == {'scripts': {'dev': 'dara dev'}}
    assert not (tmp_path / 'pyproject.toml').exists()
    assert not (tmp_path / 'js').exists()
    assert not plan_migration(tmp_path).changes
