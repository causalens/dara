"""Migration produces a reviewable diff without executing untrusted legacy application code."""

import json
from pathlib import Path

from click.testing import CliRunner
from dara.core.cli import cli
from dara.core.js_tooling.migration import plan_migration


def project(root: Path, *, named=False):
    (root / 'js').mkdir()
    (root / 'js/index.tsx').write_text(
        "import './global.css';\nexport { " + ('Counter' if named else 'default as Counter') + " } from './counter';\n"
    )
    (root / 'js/global.css').write_text('body { margin: 0; }\n')
    (root / 'js/counter.tsx').write_text(
        'export ' + ('' if named else 'default ') + 'function Counter() { return null; }\n'
    )
    (root / 'dara.config.json').write_text(
        json.dumps({'local_entry': './js', 'extra_dependencies': {'nanoid': '^3'}, 'package_manager': 'npm'})
    )
    (root / 'pyproject.toml').write_text('# keep this comment\n[tool.poetry]\nname = "example"\n')
    (root / 'main.py').write_text('''from dara.core import ComponentInstance, ConfigurationBuilder
raise RuntimeError("The migration must never import me")
config = ConfigurationBuilder()

class Counter(ComponentInstance):
    """Keep this documentation."""
    js_module = None  # keep this comment too
    js_component = 'Counter'
    py_component = 'ExistingCounter'

config.add_component(Counter, local=True)
''')
    return root


def contents(root):
    return {path.relative_to(root): path.read_bytes() for path in root.rglob('*') if path.is_file()}


def test_check_preserves_every_byte_and_does_not_import(tmp_path, monkeypatch):
    project(tmp_path)
    monkeypatch.chdir(tmp_path)
    before = contents(tmp_path)
    result = CliRunner().invoke(cli, ['migrate', '--check'])
    assert result.exit_code == 1
    assert 'js_source' in result.output
    assert 'no files written' in result.output
    assert contents(tmp_path) == before


def test_default_export_migration_preserves_registrations_names_comments_and_setup(tmp_path):
    project(tmp_path)
    entry = (tmp_path / 'js/index.tsx').read_bytes()
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    text = (tmp_path / 'main.py').read_text()
    assert "js_source = './js/counter.tsx'  # keep this comment too" in text
    assert "py_component = 'ExistingCounter'" in text
    assert 'config.add_component(Counter)' in text
    assert (tmp_path / 'js/index.tsx').read_bytes() == entry
    assert not (tmp_path / 'dara.config.json').exists()
    assert '[tool.dara]\nconfig = "main:config"' in (tmp_path / 'pyproject.toml').read_text()
    assert json.loads((tmp_path / 'package.json').read_text())['dependencies']['nanoid'] == '^3'
    assert not plan_migration(tmp_path).changes


def test_named_export_adapter_is_deterministic_and_partial_migration_is_repeatable(tmp_path):
    project(tmp_path, named=True)
    legacy = tmp_path / 'dara.config.json'
    data = json.loads(legacy.read_text())
    data['custom_vite'] = True
    legacy.write_text(json.dumps(data))
    plan = plan_migration(tmp_path)
    assert any('custom_vite' in issue.message for issue in plan.issues)
    plan.apply()
    assert legacy.exists()
    adapters = list((tmp_path / 'js/dara-adapters').glob('*.ts'))
    assert len(adapters) == 1
    assert 'export { Counter as default } from "../counter";' in adapters[0].read_text()
    assert not plan_migration(tmp_path).changes
    del data['custom_vite']
    legacy.write_text(json.dumps(data))
    plan_migration(tmp_path).apply()
    assert not legacy.exists()
    assert not plan_migration(tmp_path).changes


def test_ambiguous_entry_and_dynamic_metadata_are_reported_without_guessing(tmp_path):
    project(tmp_path)
    (tmp_path / 'js/index.tsx').write_text("export * from './counter';\nconsole.log('side effect');\n")
    source = tmp_path / 'main.py'
    source.write_text(source.read_text().replace('js_module = None', 'js_module = choose_module()'))
    plan = plan_migration(tmp_path)
    assert any('Entry contains' in issue.message for issue in plan.issues)
    assert any('dynamic metadata' in issue.message for issue in plan.issues)
    assert all(change.path != source for change in plan.changes)
    plan.apply()
    assert (tmp_path / 'dara.config.json').exists()


def test_dependency_conflict_keeps_user_requirement_and_legacy_file(tmp_path):
    project(tmp_path)
    (tmp_path / 'package.json').write_text(
        '{"dependencies":{"nanoid":"^5"},"scripts":{"dev":"dara start --reload --enable-hmr --port 9000"}}'
    )
    plan = plan_migration(tmp_path)
    assert any('nanoid' in issue.message for issue in plan.issues)
    plan.apply()
    package = json.loads((tmp_path / 'package.json').read_text())
    assert package['dependencies']['nanoid'] == '^5'
    assert package['scripts']['dev'] == 'dara dev --port 9000'
    assert (tmp_path / 'dara.config.json').exists()


def test_concurrent_edit_is_not_overwritten_or_followed_by_deletions(tmp_path):
    project(tmp_path)
    plan = plan_migration(tmp_path)
    source = tmp_path / 'main.py'
    source.write_text(source.read_text() + '# concurrent edit\n')
    plan.apply()
    assert source.read_text().endswith('# concurrent edit\n')
    assert (tmp_path / 'dara.config.json').exists()
    assert any('changed during migration' in issue.message for issue in plan.issues)


def test_known_source_tree_moves_with_relative_imports_and_style_imports_intact(tmp_path):
    project(tmp_path)
    (tmp_path / 'js').rename(tmp_path / 'frontend')
    legacy = tmp_path / 'dara.config.json'
    legacy.write_text(legacy.read_text().replace('./js', './frontend'))
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    assert (tmp_path / 'js/global.css').read_text() == 'body { margin: 0; }\n'
    assert not (tmp_path / 'frontend/index.tsx').exists()
    assert "js_source = './js/counter.tsx'" in (tmp_path / 'main.py').read_text()
    assert not plan_migration(tmp_path).changes


def test_local_registration_without_metadata_preserves_class_docstring(tmp_path):
    project(tmp_path)
    source = tmp_path / 'main.py'
    source.write_text(
        source.read_text()
        .replace('    js_module = None  # keep this comment too\n', '')
        .replace("    js_component = 'Counter'\n", '')
        .replace("    py_component = 'ExistingCounter'", "    py_component = 'Counter'")
    )
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    assert '"""Keep this documentation."""\n    js_source' in source.read_text()


def test_installed_package_exports_are_migrated_without_executing_package_code(tmp_path):
    project(tmp_path)
    package = tmp_path / 'node_modules/@acme/widgets'
    package.mkdir(parents=True)
    (package / 'package.json').write_text(
        json.dumps({'name': '@acme/widgets', 'exports': {'.': './index.js', './counter': {'default': './counter.js'}}})
    )
    (package / 'index.js').write_text("export { default as Counter } from './counter.js';\n")
    (package / 'counter.js').write_text("export default function Counter() { throw Error('Never executed'); }\n")
    source = tmp_path / 'main.py'
    source.write_text(source.read_text().replace('js_module = None', "js_module = '@acme/widgets'"))
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    assert "js_source = '@acme/widgets/counter'" in source.read_text()


def test_action_migration_keeps_its_runtime_name_and_registration(tmp_path):
    project(tmp_path)
    source = tmp_path / 'main.py'
    source.write_text(
        source.read_text()
        + "\nclass Increment(ActionImpl):\n    js_module = None\n    py_name = 'ExistingIncrement'\n\nconfig.add_action(Increment, local=True)\n"
    )
    entry = tmp_path / 'js/index.tsx'
    entry.write_text(entry.read_text() + "export { increment as ExistingIncrement } from './increment';\n")
    (tmp_path / 'js/increment.ts').write_text('export const increment = () => undefined;\n')
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    assert "py_name = 'ExistingIncrement'" in source.read_text()
    assert 'config.add_action(Increment)' in source.read_text()
    assert len(list((tmp_path / 'js/dara-adapters').glob('*.ts'))) == 1


def test_interrupted_copy_can_be_replanned_without_duplicate_or_lost_sources(tmp_path):
    project(tmp_path)
    (tmp_path / 'js').rename(tmp_path / 'frontend')
    legacy = tmp_path / 'dara.config.json'
    legacy.write_text(legacy.read_text().replace('./js', './frontend'))
    plan = plan_migration(tmp_path)
    # Simulate interruption after creation of the first destination.
    first = plan.changes[0]
    assert first.before is None and first.after is not None
    first.path.parent.mkdir(parents=True, exist_ok=True)
    first.path.write_text(first.after)
    retry = plan_migration(tmp_path)
    assert not retry.issues
    retry.apply()
    assert (tmp_path / 'js/counter.tsx').exists()
    assert not legacy.exists()
    assert not plan_migration(tmp_path).changes


def test_dynamic_import_side_effect_is_not_treated_as_a_static_import(tmp_path):
    project(tmp_path)
    entry = tmp_path / 'js/index.tsx'
    entry.write_text("import('./side-effect');\n" + entry.read_text())
    plan = plan_migration(tmp_path)
    assert any('Entry contains' in issue.message for issue in plan.issues)
    plan.apply()
    assert (tmp_path / 'dara.config.json').exists()


def test_removed_declarations_and_local_option_point_to_migration():
    import pytest

    from dara.core import ComponentInstance, ConfigurationBuilder

    with pytest.raises(TypeError, match='dara migrate'):
        type('Legacy', (ComponentInstance,), {'js_module': None})

    class Current(ComponentInstance):
        js_source = './js/current.tsx'

    with pytest.raises(TypeError, match='dara migrate'):
        ConfigurationBuilder().add_component(Current, local=True)


def test_script_edits_keep_executable_permissions(tmp_path):
    project(tmp_path)
    script = tmp_path / 'dev.sh'
    script.write_text('#!/bin/sh\ndara start --reload --enable-hmr\n')
    script.chmod(0o755)
    plan_migration(tmp_path).apply()
    assert script.stat().st_mode & 0o777 == 0o755
    assert script.read_text() == '#!/bin/sh\ndara dev\n'


def test_exporting_a_previously_declared_action_gets_an_adapter(tmp_path):
    project(tmp_path, named=True)
    source = tmp_path / 'js/counter.tsx'
    source.write_text('const Counter = () => null;\nexport { Counter };\n')
    plan = plan_migration(tmp_path)
    assert not plan.issues
    plan.apply()
    assert len(list((tmp_path / 'js/dara-adapters').glob('*.ts'))) == 1
