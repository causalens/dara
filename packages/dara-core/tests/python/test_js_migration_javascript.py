"""Migration preserves the module selected by Vite and the old entry's side effects."""

import json
from pathlib import Path

import pytest

from dara.core.js_tooling.migration_javascript import JavaScriptSources
from dara.core.js_tooling.migration_plan import MigrationPlan, SourceRequest


def sources(
    root: Path, *, entry='index.tsx', directory='js', body='export default function Counter() { return null; }'
):
    root = root.resolve()
    source = root / directory
    source.mkdir(parents=True)
    (source / entry).write_text("import './global.css';\nexport { default as Counter } from './counter';\n")
    (source / 'counter.ts').write_text(body)
    (source / 'global.css').write_text('body { color: red; }\n')
    plan = MigrationPlan(root)
    return plan, source, JavaScriptSources(plan, source, root / 'js')


def request(plan, module=None):
    return SourceRequest(plan.root / 'main.py', 3, 'Counter', module, 'Counter')


def test_extension_resolution_matches_vite_and_adapter_keeps_explicit_extension(tmp_path):
    plan, source, js = sources(tmp_path)
    (source / 'counter.tsx').write_text('export default function Counter() { return "other"; }')
    assert js.resolve(request(plan)) == './js/counter.ts'
    (source / 'index.tsx').write_text("export { Counter } from './counter.tsx';\n")
    (source / 'counter.tsx').write_text('export function Counter() { return "intended"; }')
    plan = MigrationPlan(tmp_path.resolve())
    js = JavaScriptSources(plan, source, source)
    adapter = js.resolve(request(plan))
    plan.finish()
    assert adapter.startswith('./js/dara-adapters/')
    assert 'from "../counter.tsx"' in next(change.after for change in plan.changes if change.path.suffix == '.ts')
    assert not plan.issues


@pytest.mark.parametrize('entry', ['index.ts', 'index.js', 'index.jsx', 'index.mjs'])
def test_non_tsx_entry_remains_reachable_with_setup_and_styles_intact(tmp_path, entry):
    plan, source, js = sources(tmp_path, entry=entry)
    before = (source / entry).read_bytes()
    js.prepare_entry()
    plan.finish()
    plan.apply()
    assert (source / entry).read_bytes() == before
    assert f'import "./{entry}";' in (source / 'index.tsx').read_text()
    retry = MigrationPlan(tmp_path.resolve())
    JavaScriptSources(retry, source, source).prepare_entry()
    retry.finish()
    assert not retry.changes


def test_nested_source_move_rejects_outbound_setup_css_and_asset_references(tmp_path):
    plan, source, js = sources(tmp_path, directory='frontend/src')
    (source / 'setup.ts').write_text("import '../setup';\nnew URL('../image.svg', import.meta.url);\n")
    (source / 'global.css').write_text('@import "../theme.css";\n@font-face { src: url(../fonts/body.woff); }\n')
    js.check_relocation(source.iterdir())
    assert len(plan.issues) == 4
    assert all('external relative reference' in issue.message for issue in plan.issues)


def test_same_depth_move_keeps_unchanged_external_references_and_rejects_inbound_imports(tmp_path):
    plan, source, js = sources(tmp_path, directory='frontend')
    (source / 'setup.ts').write_text("import '../shared';\n")
    js.check_relocation(source.iterdir())
    assert not plan.issues
    consumer = tmp_path / 'pages/consumer.ts'
    consumer.parent.mkdir()
    consumer.write_text("import '../frontend/counter';\n")
    js.check_external_references([consumer])
    assert len(plan.issues) == 1
    assert plan.issues[0].path == consumer


@pytest.mark.parametrize(
    'conditions',
    [
        {'default': './other.js', 'dara-source': './counter.js'},
        {'production': './other.js', 'default': './counter.js'},
        {'browser': './other.js', 'dara-source': './counter.js'},
    ],
)
def test_package_subpath_requires_same_actual_module_in_supported_conditions(tmp_path, conditions):
    plan, _, js = sources(tmp_path)
    package = tmp_path / 'node_modules/@acme/widgets'
    package.mkdir(parents=True)
    (package / 'package.json').write_text(
        json.dumps({'name': '@acme/widgets', 'exports': {'.': './index.js', './counter': conditions}})
    )
    (package / 'index.js').write_text("export { default as Counter } from './counter.js';\n")
    (package / 'counter.js').write_text('export default function Counter() {}')
    (package / 'other.js').write_text('export default function Other() {}')
    assert js.resolve(request(plan, '@acme/widgets')) is None
    assert any('verified default-export' in issue.message for issue in plan.issues)


@pytest.mark.parametrize(
    'body',
    [
        'const text = `export default function Counter() {}`;',
        'const text = `outer ${`export default function Counter() {}`} tail`;',
        'const pattern = /export default function Counter/;',
        'const pattern = /[{}] export default/;',
        'export default interface Counter {}',
        'const label = <p>export default fake</p>;',
    ],
)
def test_templates_regexes_and_types_cannot_prove_runtime_exports(tmp_path, body):
    plan, _, js = sources(tmp_path, body=body)
    assert js.resolve(request(plan)) is None
    assert any('Cannot prove export' in issue.message for issue in plan.issues)


def test_real_export_survives_templates_regex_literals_and_jsx(tmp_path):
    plan, _, js = sources(
        tmp_path,
        body='const text = `outer ${`inner ${1}`}`; const pattern = /[{}]/; export default function Counter() { return <div>{text}</div>; }',
    )
    assert js.resolve(request(plan)) == './js/counter.ts'
    assert not plan.issues


@pytest.mark.parametrize(
    'body',
    [
        'const label = <p>export function Counter</p>;',
        'const Counter = () => <div/>; export { Counter };',
        'declare const Counter: unknown; export { Counter };',
    ],
)
def test_unparenthesized_jsx_before_export_requires_manual_resolution(tmp_path, body):
    plan, source, _ = sources(tmp_path, body=body)
    (source / 'index.tsx').write_text("export { Counter } from './counter';\n")
    plan = MigrationPlan(tmp_path.resolve())
    assert JavaScriptSources(plan, source, source).resolve(request(plan)) is None


@pytest.mark.parametrize(
    'config, allowed',
    [
        ({'compilerOptions': {'noEmit': True}}, False),
        ({'extends': '@darajs/vite-plugin/tsconfig.json'}, True),
        (
            {'extends': '@darajs/vite-plugin/tsconfig.json', 'compilerOptions': {'allowImportingTsExtensions': False}},
            False,
        ),
        ({'compilerOptions': {'allowImportingTsExtensions': True}}, True),
    ],
)
def test_typed_adapters_require_explicit_extension_support_in_custom_config(tmp_path, config, allowed):
    plan, source, _ = sources(tmp_path, body='export function Counter() {}')
    (tmp_path / 'tsconfig.json').write_text(json.dumps(config))
    (source / 'index.tsx').write_text("export { Counter } from './counter';\n")
    plan = MigrationPlan(tmp_path.resolve())
    result = JavaScriptSources(plan, source, source).resolve(request(plan))
    assert (result is not None) is allowed
    if not allowed:
        assert 'allowImportingTsExtensions' in plan.issues[0].message


def test_typed_entry_forwarding_requires_extension_support_in_custom_config(tmp_path):
    plan, _, js = sources(tmp_path, entry='index.ts')
    (tmp_path / 'tsconfig.json').write_text('{"compilerOptions": {"noEmit": true}}')
    js.prepare_entry()
    plan.finish()
    assert not plan.changes
    assert 'allowImportingTsExtensions' in plan.issues[0].message


def test_named_action_with_generic_variable_annotation_remains_provable(tmp_path):
    plan, source, _ = sources(
        tmp_path,
        body='const Counter: ActionHandler<IncrementImpl> = async (context, value) => { return value + 1; }; export { Counter };',
    )
    (source / 'index.tsx').write_text("export { Counter } from './counter';\n")
    plan = MigrationPlan(tmp_path.resolve())
    assert JavaScriptSources(plan, source, source).resolve(request(plan)).startswith('./js/dara-adapters/')
    assert not plan.issues


@pytest.mark.parametrize(
    'contents',
    [
        '<script src=frontend/index.tsx></script>',
        '<script src="frontend/index.tsx"></script>',
        "<link href='frontend/global.css'>",
        'body { background: url(frontend/image.svg); }',
        'body { background: url("frontend/image.svg"); }',
    ],
)
def test_bare_relative_urls_into_moved_source_are_reported(tmp_path, contents):
    plan, _, js = sources(tmp_path, directory='frontend')
    consumer = tmp_path / 'index.html'
    consumer.write_text(contents)
    js.check_external_references([consumer])
    assert len(plan.issues) == 1
    assert plan.issues[0].path == consumer
    assert 'relocated js/' in plan.issues[0].message


@pytest.mark.parametrize(
    'reference',
    [
        '/frontend/image.svg',
        '//example.com/frontend/image.svg',
        'https://example.com/frontend/image.svg',
        'data:image/svg+xml,frontend/image.svg',
        '#frontend/image.svg',
        '?frontend/image.svg',
    ],
)
def test_non_relative_urls_are_not_relocated(tmp_path, reference):
    plan, _, js = sources(tmp_path, directory='frontend')
    consumer = tmp_path / 'index.html'
    consumer.write_text(f'<script src="{reference}"></script> <style>body {{ background: url({reference}); }}</style>')
    js.check_external_references([consumer])
    assert not plan.issues


def test_bare_javascript_strings_are_not_interpreted_as_relative_urls(tmp_path):
    plan, _, js = sources(tmp_path, directory='frontend')
    consumer = tmp_path / 'consumer.ts'
    consumer.write_text('const label = "frontend/index.tsx";')
    js.check_external_references([consumer])
    assert not plan.issues
