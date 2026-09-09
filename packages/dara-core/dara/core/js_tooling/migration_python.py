"""Conservative Python declaration edits without importing application code."""

import ast
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path

from dara.core.js_tooling.migration_plan import MigrationIssue, MigrationPlan, SourceRequest
from dara.core.js_tooling.source import parse_js_source

_LEGACY = {'js_module', 'js_component'}
_METADATA = _LEGACY | {'js_source', 'py_component', 'py_name'}
_COMPONENT_BASES = {
    'dara.core.ComponentInstance',
    'dara.core.StyledComponentInstance',
    'dara.core.definitions.ComponentInstance',
    'dara.core.definitions.StyledComponentInstance',
}
_ACTION_BASES = {'dara.core.ActionImpl', 'dara.core.base_definitions.ActionImpl'}
_BUILDERS = {'dara.core.ConfigurationBuilder', 'dara.core.configuration.ConfigurationBuilder'}
ClassKey = tuple[Path, int]
Edit = tuple[int, int, str]


@dataclass
class _Module:
    path: Path
    text: str
    tree: ast.Module
    bindings: dict[str, list[ast.stmt]]
    imports: dict[str, str]
    wildcard_import: bool
    modified_builders: set[str] = field(default_factory=set)

    def binding(self, name: str, before: int) -> ast.stmt | None:
        candidates = self.bindings.get(name, [])
        if (
            self.wildcard_import
            or len(candidates) != 1
            or candidates[0] not in self.tree.body
            or candidates[0].lineno >= before
        ):
            return None
        return candidates[0]

    def qualified(self, expression: ast.expr, before: int) -> str | None:
        if isinstance(expression, ast.Name) and self.binding(expression.id, before) is not None:
            return self.imports.get(expression.id)
        if isinstance(expression, ast.Attribute):
            parent = self.qualified(expression.value, before)
            return f'{parent}.{expression.attr}' if parent else None
        return None


@dataclass
class _Declaration:
    module: _Module
    node: ast.ClassDef
    metadata: dict[str, str | None]
    legacy_nodes: list[ast.stmt]
    existing_source: str | None
    action: bool

    @property
    def key(self) -> ClassKey:
        return self.module.path, self.node.lineno


@dataclass(frozen=True)
class _Registration:
    module: _Module
    call: ast.Call
    keyword: ast.keyword
    target: ClassKey | None


@dataclass
class PythonSources:
    """Parsed source requests and private evidence needed to apply their resolutions."""

    needed: bool = False
    requests: list[SourceRequest] = field(default_factory=list)
    _modules: dict[Path, _Module] = field(default_factory=dict)
    _declarations: dict[ClassKey, _Declaration] = field(default_factory=dict)
    _registrations: list[_Registration] = field(default_factory=list)
    _parents: dict[ClassKey, set[ClassKey]] = field(default_factory=dict)
    _unresolved: set[ClassKey] = field(default_factory=set)


def _ancestors(sources: PythonSources, key: ClassKey) -> set[ClassKey]:
    ancestors: set[ClassKey] = set()
    remaining = list(sources._parents.get(key, set()))
    while remaining:
        parent = remaining.pop()
        if parent not in ancestors:
            ancestors.add(parent)
            remaining.extend(sources._parents.get(parent, set()))
    return ancestors


def _issue(plan: MigrationPlan, path: Path, node: ast.stmt | ast.expr, message: str) -> None:
    plan.issues.append(MigrationIssue(path, node.lineno, message))


def _assignment(node: ast.AST) -> tuple[str, ast.expr] | None:
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
        return node.targets[0].id, node.value
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
        return node.target.id, node.value
    return None


def _stores(node: ast.AST):
    """Find bindings in this scope, including conditional writes but excluding nested scopes."""
    if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
        yield node.name
    elif isinstance(node, (ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
        return
    elif isinstance(node, ast.Import):
        yield from (alias.asname or alias.name.split('.')[0] for alias in node.names)
    elif isinstance(node, ast.ImportFrom):
        yield from (alias.asname or alias.name for alias in node.names)
    elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
        yield node.id
    elif isinstance(node, (ast.MatchAs, ast.MatchStar, ast.ExceptHandler)):
        if node.name:
            yield node.name
        for child in ast.iter_child_nodes(node):
            yield from _stores(child)
    elif isinstance(node, ast.MatchMapping):
        if node.rest:
            yield node.rest
        for child in ast.iter_child_nodes(node):
            yield from _stores(child)
    else:
        for child in ast.iter_child_nodes(node):
            yield from _stores(child)


def _module_name(path: Path, root: Path) -> str | None:
    parts = list(path.relative_to(root).with_suffix('').parts)
    if parts[-1] == '__init__':
        parts.pop()
    return '.'.join(parts) if parts and all(part.isidentifier() for part in parts) else None


def _parse_module(path: Path, text: str, root: Path) -> _Module:
    tree = ast.parse(text)
    bindings: dict[str, list[ast.stmt]] = {}
    imports: dict[str, str] = {}
    for statement in tree.body:
        for name in _stores(statement):
            bindings.setdefault(name, []).append(statement)
        if isinstance(statement, ast.Import):
            for alias in statement.names:
                imports[alias.asname or alias.name.split('.')[0]] = (
                    alias.name if alias.asname else alias.name.split('.')[0]
                )
        elif isinstance(statement, ast.ImportFrom):
            module = statement.module or ''
            if statement.level:
                current = _module_name(path, root)
                package = (current or '').split('.') if path.stem == '__init__' else (current or '').split('.')[:-1]
                if statement.level > len(package):
                    continue
                module = '.'.join([*package[: len(package) - statement.level + 1], *module.split('.')]).rstrip('.')
            for alias in statement.names:
                imports[alias.asname or alias.name] = f'{module}.{alias.name}'
    wildcard_import = any(
        isinstance(node, ast.ImportFrom) and any(alias.name == '*' for alias in node.names) for node in ast.walk(tree)
    )
    return _Module(path, text, tree, bindings, imports, wildcard_import)


def _class_target(
    module: _Module, expression: ast.expr, before: int, modules: Mapping[str, _Module]
) -> ClassKey | None:
    if isinstance(expression, ast.Name):
        binding = module.binding(expression.id, before)
        if isinstance(binding, ast.ClassDef):
            return module.path, binding.lineno
    imported = module.qualified(expression, before)
    if imported is None or '.' not in imported:
        return None
    module_name, name = imported.rsplit('.', 1)
    imported_module = modules.get(module_name)
    if imported_module is None:
        return None
    binding = imported_module.binding(name, len(imported_module.text.splitlines()) + 1)
    return (imported_module.path, binding.lineno) if isinstance(binding, ast.ClassDef) else None


def _builder(module: _Module, expression: ast.expr, before: int) -> bool:
    if not isinstance(expression, ast.Name) or expression.id in module.modified_builders:
        return False
    binding = module.binding(expression.id, before)
    if binding is None:
        return False
    assignment = _assignment(binding)
    return bool(
        assignment
        and isinstance(assignment[1], ast.Call)
        and module.qualified(assignment[1].func, binding.lineno) in _BUILDERS
    )


def _aliases(module: _Module, expression: ast.expr, before: int):
    """Follow only direct immutable assignment aliases when checking observed mutations."""
    visited: set[str] = set()
    while isinstance(expression, ast.Name) and expression.id not in visited:
        visited.add(expression.id)
        yield expression, before
        binding = module.binding(expression.id, before)
        if binding is None:
            break
        assignment = _assignment(binding)
        if assignment is None:
            break
        expression = assignment[1]
        before = binding.lineno
    if isinstance(expression, ast.Attribute):
        yield expression, before


def _mutations(module: _Module):
    for node in ast.walk(module.tree):
        if isinstance(node, ast.Attribute) and isinstance(node.ctx, (ast.Store, ast.Del)):
            yield node.value, node.attr, node.lineno
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in ('setattr', 'delattr')
            and len(node.args) >= 2
            and isinstance(node.args[1], ast.Constant)
            and isinstance(node.args[1].value, str)
        ):
            yield node.args[0], node.args[1].value, node.lineno


def analyze_python(files: Iterable[Path], plan: MigrationPlan) -> PythonSources:
    """Request sources only for literal declarations with unambiguous class and registration bindings."""
    sources = PythonSources()
    for path in files:
        if path.suffix != '.py':
            continue
        text = plan.read(path)
        if text is None:
            continue
        try:
            sources._modules[path] = _parse_module(path, text, plan.root)
        except SyntaxError as error:
            plan.issues.append(
                MigrationIssue(path, error.lineno or 1, f'Fix Python syntax before migration: {error.msg}')
            )

    named_modules: dict[str, list[_Module]] = {}
    for module in sources._modules.values():
        if (name := _module_name(module.path, plan.root)) is not None:
            named_modules.setdefault(name, []).append(module)
    module_names = {name: modules[0] for name, modules in named_modules.items() if len(modules) == 1}
    modified_classes: set[ClassKey] = set()
    for module in sources._modules.values():
        for expression, attribute, before in _mutations(module):
            # Replacing an imported module's class binding invalidates its identity too.
            replaced = _class_target(module, ast.Attribute(value=expression, attr=attribute), before, module_names)
            if replaced is not None:
                modified_classes.add(replaced)
            for alias, alias_before in _aliases(module, expression, before):
                if attribute in _METADATA | {'__bases__', '__name__'}:
                    target = _class_target(module, alias, alias_before, module_names)
                    if target is not None:
                        modified_classes.add(target)
                        if attribute in _LEGACY:
                            sources.needed = True
                if attribute in ('add_component', 'add_action') and isinstance(alias, ast.Name):
                    module.modified_builders.add(alias.id)
    classes: dict[ClassKey, tuple[_Module, ast.ClassDef]] = {}
    legacy_classes: set[ClassKey] = set()
    local_targets: set[ClassKey] = set()
    for module in sources._modules.values():
        direct_calls = {
            statement.value
            for statement in module.tree.body
            if isinstance(statement, (ast.Expr, ast.Assign, ast.AnnAssign)) and isinstance(statement.value, ast.Call)
        }
        for node in ast.walk(module.tree):
            if isinstance(node, ast.ClassDef):
                classes[module.path, node.lineno] = module, node
                if any(set(_stores(statement)) & _LEGACY for statement in node.body):
                    sources.needed = True
                    legacy_classes.add((module.path, node.lineno))
            elif (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in ('add_component', 'add_action')
            ):
                for keyword in node.keywords:
                    if keyword.arg != 'local':
                        continue
                    sources.needed = True
                    arguments = list(node.args[:1]) or [
                        kw.value
                        for kw in node.keywords
                        if kw.arg == ('component' if node.func.attr == 'add_component' else 'action')
                    ]
                    target = None
                    if (
                        node in direct_calls
                        and _builder(module, node.func.value, node.lineno)
                        and isinstance(keyword.value, ast.Constant)
                        and keyword.value.value is True
                        and len(arguments) == 1
                        and all(kw.arg is not None for kw in node.keywords)
                    ):
                        target = _class_target(module, arguments[0], node.lineno, module_names)
                    sources._registrations.append(_Registration(module, node, keyword, target))
                    if target is not None:
                        local_targets.add(target)

    if not sources.needed:
        return sources

    sources._parents = {
        key: {
            parent
            for base in node.bases
            if (parent := _class_target(module, base, node.lineno, module_names)) is not None
        }
        for key, (module, node) in classes.items()
    }

    inspected: set[ClassKey] = set()

    def inspect(key: ClassKey) -> _Declaration | None:
        if key in inspected:
            return sources._declarations.get(key)
        inspected.add(key)
        module, node = classes[key]
        own_metadata = [statement for statement in node.body if set(_stores(statement)) & _METADATA]
        relevant = bool(
            own_metadata or key in local_targets or key in modified_classes or _ancestors(sources, key) & legacy_classes
        )
        if relevant:
            sources._unresolved.add(key)
        if module.wildcard_import or key in modified_classes:
            if relevant:
                _issue(
                    plan,
                    module.path,
                    node,
                    f'{node.name}: wildcard imports or external metadata writes prevent a static source proof; resolve js_source and registrations manually.',
                )
            return None
        if node not in module.tree.body or len(module.bindings.get(node.name, [])) != 1:
            if relevant:
                _issue(
                    plan,
                    module.path,
                    node,
                    f'{node.name}: nested or rebound class name; set js_source and review its registrations manually.',
                )
            return None
        if len(node.bases) != 1 or node.keywords or node.decorator_list:
            if relevant:
                _issue(
                    plan,
                    module.path,
                    node,
                    f'{node.name}: decorated, multiple-base or customized class; resolve inherited JavaScript metadata manually.',
                )
            return None
        own_source = any(
            (assignment := _assignment(statement)) and assignment[0] == 'js_source' for statement in own_metadata
        )
        if relevant and not own_source and any(parent[0] != module.path for parent in sources._parents[key]):
            _issue(
                plan,
                module.path,
                node,
                f'{node.name}: inherited metadata spans files; set an explicit js_source before migrating its base so interrupted writes cannot change the inherited implementation.',
            )
            return None
        base = module.qualified(node.bases[0], node.lineno)
        parent = None
        if base not in _COMPONENT_BASES | _ACTION_BASES:
            parent_key = _class_target(module, node.bases[0], node.lineno, module_names)
            if parent_key is not None:
                parent = inspect(parent_key)
            if parent is None:
                if relevant:
                    _issue(
                        plan,
                        module.path,
                        node,
                        f'{node.name}: cannot prove its Dara base or inherited metadata; add js_source manually.',
                    )
                return None
        metadata = dict(parent.metadata) if parent else {}
        existing_source = parent.existing_source if parent else None
        assignments: dict[str, tuple[ast.stmt, ast.expr]] = {}
        for statement in own_metadata:
            assignment = _assignment(statement)
            if assignment is None or assignment[0] not in _METADATA or assignment[0] in assignments:
                _issue(
                    plan,
                    module.path,
                    statement,
                    f'{node.name}: repeated or conditional JavaScript metadata; resolve it to one literal declaration before migration.',
                )
                return None
            name, value = assignment
            if not isinstance(value, ast.Constant) or (value.value is not None and not isinstance(value.value, str)):
                _issue(
                    plan,
                    module.path,
                    statement,
                    f'{node.name}: replace dynamic metadata with a literal js_source; preserve runtime naming overrides.',
                )
                return None
            assignments[name] = statement, value
            metadata[name] = value.value
        if 'js_source' in assignments:
            existing_source = metadata['js_source']
        if existing_source is not None:
            try:
                parse_js_source(existing_source)
            except ValueError as error:
                _issue(plan, module.path, node, f'{node.name}: resolve js_source before removing local=: {error}')
                return None
        legacy_nodes = [statement for name, (statement, _) in assignments.items() if name in _LEGACY]
        if existing_source is not None and legacy_nodes:
            _issue(
                plan,
                module.path,
                node,
                f'{node.name}: remove legacy declarations after reviewing the existing js_source.',
            )
            return None
        declaration = _Declaration(
            module, node, metadata, legacy_nodes, existing_source, parent.action if parent else base in _ACTION_BASES
        )
        sources._declarations[key] = declaration
        sources._unresolved.discard(key)
        if existing_source is None and (_LEGACY.intersection(metadata) or key in local_targets):
            export_name = (
                metadata.get('js_component')
                or metadata.get('py_name' if declaration.action else 'py_component')
                or node.name
            )
            sources.requests.append(
                SourceRequest(module.path, node.lineno, node.name, metadata.get('js_module'), export_name)
            )
        return declaration

    for key in classes:
        inspect(key)
    return sources


def _span(text: str, node: ast.stmt | ast.expr | ast.keyword) -> tuple[int, int]:
    assert node.end_lineno is not None and node.end_col_offset is not None
    lines = text.splitlines(keepends=True)
    start = sum(len(line) for line in lines[: node.lineno - 1])
    end = sum(len(line) for line in lines[: node.end_lineno - 1])
    start += len(lines[node.lineno - 1].encode()[: node.col_offset].decode())
    end += len(lines[node.end_lineno - 1].encode()[: node.end_col_offset].decode())
    return start, end


def _apply(text: str, edits: list[Edit]) -> str:
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    return text


def _insert_source(declaration: _Declaration, source: str) -> Edit:
    text, node = declaration.module.text, declaration.node
    newline = '\r\n' if '\r\n' in text else '\n'
    first = node.body[0]
    value = f'js_source = {source!r}'
    docstring = (
        isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str)
    )
    if node.lineno == first.lineno:
        start, end = _span(text, first)
        return (end, end, f'; {value}') if docstring else (start, start, f'{value}; ')
    if docstring and len(node.body) == 1:
        start, end = _span(text, first)
        indent = text[text.rfind('\n', 0, start) + 1 : start]
        line_end = text.find('\n', end)
        if line_end == -1:
            return len(text), len(text), f'{newline}{indent}{value}{newline}'
        return line_end + 1, line_end + 1, f'{indent}{value}{newline}'
    first = node.body[1] if docstring else first
    start, _ = _span(text, first)
    indent = text[text.rfind('\n', 0, start) + 1 : start]
    if indent.strip():
        return start, start, f'{value}; '
    return start, start, f'{value}{newline}{indent}'


def _remove_keyword(text: str, keyword: ast.keyword, call: ast.Call) -> Edit:
    start, end = _span(text, keyword)
    _, call_end = _span(text, call)
    match = re.match(r'\s*,', text[end : call_end - 1])
    if match:
        return start, end + match.end(), ''
    comma = re.search(r',\s*$', text[:start])
    return (comma.start() if comma else start), end, ''


def _add_edits(
    module: _Module,
    edits: dict[Path, list[Edit]],
    additions: list[Edit],
    plan: MigrationPlan,
    node: ast.stmt | ast.expr,
) -> bool:
    combined = [*edits.get(module.path, []), *additions]
    try:
        ast.parse(_apply(module.text, combined))
    except SyntaxError:
        _issue(
            plan,
            module.path,
            node,
            'This source layout needs a manual metadata/registration edit; the proposed change would not preserve valid Python.',
        )
        return False
    edits[module.path] = combined
    return True


def apply_sources(sources: PythonSources, resolved: Mapping[SourceRequest, str], plan: MigrationPlan) -> None:
    """Apply proven source resolutions and remove local=True only from matching registrations."""
    edits: dict[Path, list[Edit]] = {}
    pending: dict[ClassKey, list[Edit]] = {}
    available = {key for key, declaration in sources._declarations.items() if declaration.existing_source is not None}
    for request, source in resolved.items():
        key = request.path, request.line
        declaration = sources._declarations[key]
        if declaration.legacy_nodes:
            first, *remaining = declaration.legacy_nodes
            start, end = _span(declaration.module.text, first)
            additions = [(start, end, f'js_source = {source!r}')]
            additions.extend((*_span(declaration.module.text, node), '') for node in remaining)
        else:
            additions = [_insert_source(declaration, source)]
        if _add_edits(declaration.module, edits, additions, plan, declaration.node):
            pending[key] = additions
    # A migrated base must not erase the inherited lookup still needed by an
    # unresolved descendant. Supported inheritance families share one atomic file edit.
    unresolved = sources._unresolved | {
        (request.path, request.line) for request in sources.requests if (request.path, request.line) not in pending
    }
    blocked = {ancestor for key in unresolved for ancestor in _ancestors(sources, key)}
    edits = {}
    for key, additions in pending.items():
        declaration = sources._declarations[key]
        if key in blocked:
            _issue(
                plan,
                declaration.module.path,
                declaration.node,
                f'{declaration.node.name}: resolve descendant source declarations before replacing inherited metadata.',
            )
            continue
        edits.setdefault(declaration.module.path, []).extend(additions)
        available.add(key)
    for registration in sources._registrations:
        if registration.target not in available:
            _issue(
                plan,
                registration.module.path,
                registration.call,
                'Keep this registration: resolve its builder, class binding and literal js_source before removing local=True.',
            )
            continue
        _add_edits(
            registration.module,
            edits,
            [_remove_keyword(registration.module.text, registration.keyword, registration.call)],
            plan,
            registration.call,
        )
    for path, replacements in edits.items():
        plan.write(path, _apply(sources._modules[path].text, replacements))


def configuration_reference(sources: PythonSources, plan: MigrationPlan) -> str | None:
    """Infer one unshadowed top-level ConfigurationBuilder, using the package name for __init__.py."""
    candidates = []
    for module in sources._modules.values():
        if not _builder(module, ast.Name(id='config'), len(module.text.splitlines()) + 1):
            continue
        name = _module_name(module.path, plan.root)
        # A src layout needs its declared import root, rather than a guessed src. prefix.
        if name is not None and name.split('.')[0] != 'src':
            candidates.append(f'{name}:config')
    if len(candidates) == 1:
        return candidates[0]
    plan.issues.append(
        MigrationIssue(
            plan.root / 'pyproject.toml',
            1,
            'Set [tool.dara] config = "module:object"; the Python configuration reference or source root is ambiguous.',
        )
    )
    return None
