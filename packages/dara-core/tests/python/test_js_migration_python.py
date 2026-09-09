"""Python migration keeps lexical bindings, inherited metadata and source syntax intact."""

import ast
from pathlib import Path

import pytest

from dara.core.js_tooling.migration_plan import MigrationPlan
from dara.core.js_tooling.migration_python import analyze_python, apply_sources, configuration_reference

_PRELUDE = 'from dara.core import ComponentInstance, ConfigurationBuilder\nconfig = ConfigurationBuilder()\n'


def migrate(root: Path, text: str):
    path = root / 'main.py'
    path.write_bytes(text.encode())
    plan = MigrationPlan(root)
    sources = analyze_python([path], plan)
    apply_sources(sources, {request: f'./js/{request.export_name.lower()}.tsx' for request in sources.requests}, plan)
    plan.finish()
    plan.apply()
    return plan, sources, path.read_bytes().decode()


@pytest.mark.parametrize(
    'declaration',
    [
        'class Counter(ComponentInstance): pass\n',
        'class Counter(ComponentInstance): """inline documentation"""\n',
        'class Counter(ComponentInstance):\n\tpass\n',
        'class Counter(ComponentInstance):\n    """Only a docstring."""  # keep\n',
        'class Counter(ComponentInstance):\n    """A docstring."""\n    def method(self):\n        return "é"\n',
        'class Counter(ComponentInstance):\n    """A docstring."""; label = "é"\n',
    ],
)
def test_inserting_source_preserves_python_suites_and_docstrings(tmp_path, declaration):
    original = _PRELUDE + declaration + 'config.add_component(Counter, local=True)\n'
    plan, _, result = migrate(tmp_path, original)
    assert not plan.issues
    before = next(node for node in ast.walk(ast.parse(original)) if isinstance(node, ast.ClassDef))
    after = next(node for node in ast.walk(ast.parse(result)) if isinstance(node, ast.ClassDef))
    assert ast.get_docstring(before) == ast.get_docstring(after)
    assert "js_source = './js/counter.tsx'" in result
    assert 'config.add_component(Counter)' in result


def test_inserting_source_keeps_crlf_and_tab_indentation(tmp_path):
    original = (
        _PRELUDE + 'class Counter(ComponentInstance):\n\tpass\nconfig.add_component(Counter, local=True)\n'
    ).replace('\n', '\r\n')
    plan, _, result = migrate(tmp_path, original)
    assert not plan.issues
    assert '\r\n\tjs_source' in result
    assert '\r\n\tpass' in result
    assert '\n' not in result.replace('\r\n', '')


def test_inherited_export_name_is_not_replaced_by_subclass_runtime_name(tmp_path):
    original = (
        _PRELUDE
        + """class Base(ComponentInstance):
    js_module = None
    js_component = 'Original'

class Counter(Base):
    py_component = 'Counter'

config.add_component(Counter, local=True)
"""
    )
    plan, sources, result = migrate(tmp_path, original)
    assert not plan.issues
    assert {request.class_name: request.export_name for request in sources.requests} == {
        'Base': 'Original',
        'Counter': 'Original',
    }
    assert result.count("js_source = './js/original.tsx'") == 2
    assert "py_component = 'Counter'" in result
    assert 'config.add_component(Counter)' in result


def test_inherited_fallback_name_still_uses_subclass_name(tmp_path):
    original = (
        _PRELUDE
        + """class Base(ComponentInstance):
    js_module = None

class Counter(Base):
    pass

config.add_component(Counter, local=True)
"""
    )
    plan, sources, result = migrate(tmp_path, original)
    assert not plan.issues
    assert {request.class_name: request.export_name for request in sources.requests} == {
        'Base': 'Base',
        'Counter': 'Counter',
    }
    assert "js_source = './js/counter.tsx'" in result


@pytest.mark.parametrize(
    'body',
    [
        '    js_module = None\n    js_module = None\n',
        '    js_module = None\n    if feature:\n        js_component = "Other"\n',
        '    js_module = choose_module()\n',
        '    js_module: ClassVar[str]\n',
    ],
)
def test_ambiguous_class_metadata_is_not_partially_replaced(tmp_path, body):
    original = _PRELUDE + 'class Counter(ComponentInstance):\n' + body + 'config.add_component(Counter, local=True)\n'
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original


@pytest.mark.parametrize(
    'source',
    [
        'class Counter(ComponentInstance):\n    js_module = None\nCounter = external.Counter\nconfig.add_component(Counter, local=True)\n',
        'def register(config):\n    class Counter(ComponentInstance):\n        js_module = None\n    config.add_component(Counter, local=True)\n',
        'class Counter(ImportedBase):\n    js_component = "Counter"\nconfig.add_component(Counter, local=True)\n',
        '@decorate\nclass Counter(ComponentInstance):\n    js_module = None\nconfig.add_component(Counter, local=True)\n',
    ],
)
def test_unproven_class_bindings_and_ancestry_are_not_rewritten(tmp_path, source):
    original = _PRELUDE + source
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original


def test_unrelated_registration_receiver_does_not_lose_its_local_argument(tmp_path):
    original = (
        _PRELUDE
        + """class Counter(ComponentInstance):
    js_source = './js/counter.tsx'
other.add_component(Counter, local=True)
"""
    )
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original


def test_same_name_in_another_module_does_not_prove_an_external_import(tmp_path):
    local = tmp_path / 'local.py'
    local.write_text(
        'from dara.core import ComponentInstance\nclass Counter(ComponentInstance):\n    js_source = "./js/counter.tsx"\n'
    )
    main = tmp_path / 'main.py'
    original = _PRELUDE + 'from external import Counter\nconfig.add_component(Counter, local=True)\n'
    main.write_text(original)
    plan = MigrationPlan(tmp_path)
    sources = analyze_python([local, main], plan)
    apply_sources(sources, {}, plan)
    plan.finish()
    plan.apply()
    assert plan.issues
    assert main.read_text() == original


def test_direct_import_alias_and_keyword_registration_are_proven(tmp_path):
    local = tmp_path / 'local.py'
    local.write_text(
        'from dara.core import ComponentInstance as Component\nclass Counter(Component):\n    js_source = "./js/counter.tsx"\n'
    )
    main = tmp_path / 'main.py'
    main.write_text(
        _PRELUDE + 'from local import Counter as Imported\nconfig.add_component(component=Imported, local=True)\n'
    )
    plan = MigrationPlan(tmp_path)
    sources = analyze_python([local, main], plan)
    apply_sources(sources, {}, plan)
    plan.finish()
    plan.apply()
    assert not plan.issues
    assert 'config.add_component(component=Imported)' in main.read_text()


def test_unsafe_semicolon_removal_cannot_publish_invalid_python(tmp_path):
    original = (
        _PRELUDE
        + 'class Counter(ComponentInstance):\n    before=1; js_module=None; js_component="Counter"; after=2\nconfig.add_component(Counter, local=True)\n'
    )
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original
    ast.parse(result)


def test_package_initializer_configuration_uses_package_import(tmp_path):
    package = tmp_path / 'application'
    package.mkdir()
    path = package / '__init__.py'
    path.write_text(_PRELUDE)
    plan = MigrationPlan(tmp_path)
    assert configuration_reference(analyze_python([path], plan), plan) == 'application:config'
    assert not plan.issues


@pytest.mark.parametrize('suffix', ['config = other\n', 'ConfigurationBuilder = other\n'])
def test_rebound_configuration_is_not_guessed(tmp_path, suffix):
    path = tmp_path / 'main.py'
    path.write_text(_PRELUDE + suffix)
    plan = MigrationPlan(tmp_path)
    assert configuration_reference(analyze_python([path], plan), plan) is None
    assert plan.issues


@pytest.mark.parametrize(
    'rebinding',
    [
        'match value:\n    case Counter:\n        pass\n',
        'match value:\n    case [*Counter]:\n        pass\n',
        'match value:\n    case {**Counter}:\n        pass\n',
        'try:\n    operation()\nexcept Exception as Counter:\n    pass\n',
        'from external import *\n',
    ],
)
def test_pattern_exception_and_wildcard_bindings_are_not_treated_as_proven_classes(tmp_path, rebinding):
    original = (
        _PRELUDE
        + 'class Counter(ComponentInstance):\n    js_module = None\n'
        + rebinding
        + 'config.add_component(Counter, local=True)\n'
    )
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original


@pytest.mark.parametrize(
    'mutation',
    [
        "Counter.js_component = 'Other'\n",
        "Alias = Counter\nAlias.js_component = 'Other'\n",
        "setattr(Counter, 'js_component', 'Other')\n",
        'del Counter.js_module\n',
    ],
)
def test_observed_class_metadata_mutations_are_not_replaced_by_original_literals(tmp_path, mutation):
    original = (
        _PRELUDE
        + 'class Counter(ComponentInstance):\n    js_module = None\n'
        + mutation
        + 'config.add_component(Counter, local=True)\n'
    )
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original


def test_external_legacy_assignment_is_reported_without_a_registration(tmp_path):
    original = _PRELUDE + "class Counter(ComponentInstance):\n    pass\nCounter.js_component = 'Other'\n"
    plan, sources, result = migrate(tmp_path, original)
    assert sources.needed
    assert plan.issues
    assert result == original


def test_registration_method_replacement_through_builder_alias_preserves_local(tmp_path):
    original = (
        _PRELUDE
        + """class Counter(ComponentInstance):
    js_source = './js/counter.tsx'
alias = config
alias.add_component = other_method
config.add_component(Counter, local=True)
"""
    )
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original


@pytest.mark.parametrize('mutation', ["local.Counter.js_component = 'Other'", 'local.Counter = external.Counter'])
def test_observed_mutations_through_imported_modules_invalidate_the_class_proof(tmp_path, mutation):
    local = tmp_path / 'local.py'
    declaration = 'from dara.core import ComponentInstance\nclass Counter(ComponentInstance):\n    js_module = None\n'
    local.write_text(declaration)
    main = tmp_path / 'main.py'
    original = _PRELUDE + f'import local\n{mutation}\nconfig.add_component(local.Counter, local=True)\n'
    main.write_text(original)
    plan = MigrationPlan(tmp_path)
    sources = analyze_python([local, main], plan)
    apply_sources(sources, {request: './js/counter.tsx' for request in sources.requests}, plan)
    plan.finish()
    plan.apply()
    assert plan.issues
    assert main.read_text() == original
    assert local.read_text() == declaration


def test_unresolved_subclass_cannot_lose_its_legacy_lookup_after_partial_migration(tmp_path):
    path = tmp_path / 'main.py'
    original = (
        _PRELUDE
        + """class Base(ComponentInstance):
    js_module = None

class Counter(Base):
    pass

config.add_component(Counter, local=True)
"""
    )
    path.write_text(original)
    for _ in range(2):
        plan = MigrationPlan(tmp_path)
        sources = analyze_python([path], plan)
        assert {request.class_name for request in sources.requests} == {'Base', 'Counter'}
        apply_sources(
            sources, {request: './js/base.tsx' for request in sources.requests if request.class_name == 'Base'}, plan
        )
        plan.finish()
        plan.apply()
        assert plan.issues
        assert path.read_text() == original


def test_cross_file_inheritance_requires_explicit_source_before_mutating_the_base(tmp_path):
    parent = tmp_path / 'base.py'
    parent_text = 'from dara.core import ComponentInstance\nclass Base(ComponentInstance):\n    js_module = None\n'
    parent.write_text(parent_text)
    child = tmp_path / 'main.py'
    child_text = (
        _PRELUDE + 'from base import Base\nclass Counter(Base):\n    pass\nconfig.add_component(Counter, local=True)\n'
    )
    child.write_text(child_text)
    for _ in range(2):
        plan = MigrationPlan(tmp_path)
        sources = analyze_python([parent, child], plan)
        apply_sources(sources, {request: './js/base.tsx' for request in sources.requests}, plan)
        plan.finish()
        plan.apply()
        assert any('spans files' in issue.message for issue in plan.issues)
        assert parent.read_text() == parent_text
        assert child.read_text() == child_text

    child.write_text(child_text.replace('    pass', '    js_source = "./js/counter.tsx"'))
    plan = MigrationPlan(tmp_path)
    sources = analyze_python([parent, child], plan)
    apply_sources(sources, {request: './js/base.tsx' for request in sources.requests}, plan)
    plan.finish()
    plan.apply()
    assert not plan.issues
    assert "js_source = './js/base.tsx'" in parent.read_text()
    assert 'config.add_component(Counter)' in child.read_text()


def test_unsupported_descendant_keeps_ancestor_lookup_available_for_retry(tmp_path):
    original = (
        _PRELUDE
        + """class Base(ComponentInstance):
    js_module = None

@decorate
class Counter(Base):
    pass
"""
    )
    plan, _, result = migrate(tmp_path, original)
    assert plan.issues
    assert result == original
