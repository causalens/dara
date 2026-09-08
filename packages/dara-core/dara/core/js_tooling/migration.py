"""Plan conservative source migrations without importing or executing the legacy application."""

import ast
import difflib
import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import toml

from dara.core.js_tooling.project import atomic_write, json_text
from dara.core.js_tooling.source import parse_js_source

_EXCLUDED = {'.git', '.venv', 'node_modules', 'dist', '__pycache__', '.dara'}
_LEGACY = {'js_module', 'js_component'}


@dataclass(frozen=True)
class MigrationIssue:
    """An unresolved source location and the concrete edit needed there."""

    path: Path
    line: int
    message: str


@dataclass(frozen=True)
class Change:
    """One compare-before-write replacement, creation or removal."""

    path: Path
    before: str | None
    after: str | None

    def diff(self, root: Path) -> str:
        """Render a standard unified diff for review, including additions and removals."""
        name = str(self.path.relative_to(root))
        return ''.join(
            difflib.unified_diff(
                (self.before or '').splitlines(keepends=True),
                (self.after or '').splitlines(keepends=True),
                fromfile=f'a/{name}' if self.before is not None else '/dev/null',
                tofile=f'b/{name}' if self.after is not None else '/dev/null',
            )
        )


@dataclass
class MigrationPlan:
    """A reviewable partial migration; unresolved cases never authorize guesses."""

    root: Path
    changes: list[Change] = field(default_factory=list)
    issues: list[MigrationIssue] = field(default_factory=list)
    notices: list[str] = field(default_factory=list)

    def apply(self) -> list[Path]:
        """Apply in dependency order, stopping if a concurrent edit invalidates the plan."""
        written = []
        for change in self.changes:
            current = change.path.read_text() if change.path.exists() else None
            if current != change.before:
                self.issues.append(MigrationIssue(change.path, 1, 'File changed during migration; rerun dara migrate.'))
                break
            if change.after is None:
                change.path.unlink()
            else:
                mode = change.path.stat().st_mode & 0o777 if change.path.exists() else None
                atomic_write(change.path, change.after)
                if mode is not None:
                    change.path.chmod(mode)
            written.append(change.path)
        return written


def _files(root: Path):
    for directory, children, files in os.walk(root, followlinks=False):
        children[:] = sorted(name for name in children if name not in _EXCLUDED and not name.startswith('.'))
        for name in sorted(files):
            path = Path(directory) / name
            if not path.is_symlink():
                yield path


def _span(text: str, node: ast.AST) -> tuple[int, int]:
    # Python AST columns count UTF-8 bytes, while edits use Unicode character offsets.
    lines = text.splitlines(keepends=True)
    start = sum(len(line) for line in lines[: node.lineno - 1])  # type: ignore[attr-defined]
    end = sum(len(line) for line in lines[: node.end_lineno - 1])  # type: ignore[attr-defined]
    start += len(lines[node.lineno - 1].encode()[: node.col_offset].decode())  # type: ignore[attr-defined]
    end += len(lines[node.end_lineno - 1].encode()[: node.end_col_offset].decode())  # type: ignore[attr-defined]
    return start, end


def _apply_edits(text: str, edits: list[tuple[int, int, str]]) -> str:
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    return text


def _assignment(node: ast.stmt) -> tuple[str, ast.expr] | None:
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
        return node.targets[0].id, node.value
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
        return node.target.id, node.value
    return None


def _literal(node: ast.AST):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError):
        return ...


# This lexer recognizes a deliberately small entry-barrel grammar. Everything else is a manual case.
# Strings/comments remain single tokens, so examples in comments cannot be mistaken for exports.
_TOKEN = re.compile(r'\s+|//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_$][\w$]*|.', re.S)


def _tokens(text: str) -> list[str]:
    return [token for token in _TOKEN.findall(text) if not token.isspace() and not token.startswith(('//', '/*'))]


def _js_string(token: str) -> str | None:
    if token[:1] not in ('"', "'") or '\\' in token:
        return None
    return token[1:-1]


def _entry_exports(text: str) -> tuple[dict[str, tuple[str, str]], bool]:
    """Read only explicit re-exports and imports; never infer exports from arbitrary JS code."""
    tokens = _tokens(text)
    exports: dict[str, tuple[str, str]] = {}
    index = 0
    while index < len(tokens):
        if tokens[index] == ';':
            index += 1
            continue
        if tokens[index] == 'import':
            # Preserve setup, CSS and other imports byte-for-byte in the entry.
            end = index + 1
            while end < len(tokens) and tokens[end] != ';':
                end += 1
            imported = tokens[index + 1 : end]
            if end == len(tokens) or not (
                (len(imported) == 1 and _js_string(imported[0]) is not None)
                or (
                    len(imported) >= 3
                    and imported[-2] == 'from'
                    and _js_string(imported[-1]) is not None
                    and '(' not in imported
                )
            ):
                return exports, False
            index = end + 1
            continue
        if tokens[index : index + 2] != ['export', '{']:
            return exports, False
        end = index + 2
        while end < len(tokens) and tokens[end] != '}':
            end += 1
        if end >= len(tokens):
            return exports, False
        members = tokens[index + 2 : end]
        if not members and (end + 1 == len(tokens) or tokens[end + 1] == ';'):
            index = end + 1
            continue
        if end + 2 >= len(tokens) or tokens[end + 1] != 'from':
            return exports, False
        source = _js_string(tokens[end + 2])
        if source is None:
            return exports, False
        while members:
            if members[0] == ',':
                members = members[1:]
                continue
            original = members.pop(0)
            exported = original
            if members[:1] == ['as'] and len(members) >= 2:
                exported = members[1]
                members = members[2:]
            if members and members[0] != ',':
                return exports, False
            if not re.fullmatch(r'[A-Za-z_$][\w$]*', original) or not re.fullmatch(r'[A-Za-z_$][\w$]*', exported):
                return exports, False
            if exported in exports:
                return exports, False
            exports[exported] = (source, original)
        index = end + 3
    return exports, True


def _resolve_file(base: Path) -> Path | None:
    return next(
        (
            candidate
            for candidate in [
                base,
                *[Path(str(base) + ext) for ext in ('.tsx', '.ts', '.jsx', '.js')],
                base / 'index.tsx',
                base / 'index.ts',
                base / 'index.jsx',
                base / 'index.js',
            ]
            if candidate.is_file()
        ),
        None,
    )


def _known_export(text: str, name: str) -> bool:
    tokens = _tokens(text)
    depth = 0
    declarations: set[str] = set()
    named_exports: dict[str, str] = {}
    for index, token in enumerate(tokens):
        if depth == 0 and token in ('const', 'let', 'var', 'function', 'class') and index + 1 < len(tokens):
            declarations.add(tokens[index + 1])
        if depth == 0 and tokens[index : index + 2] == ['export', '{']:
            end = index + 2
            while end < len(tokens) and tokens[end] != '}':
                end += 1
            if end < len(tokens) and tokens[end + 1 : end + 2] != ['from']:
                members = tokens[index + 2 : end]
                cursor = 0
                while cursor < len(members):
                    local = members[cursor]
                    cursor += 1
                    exported = local
                    if members[cursor : cursor + 1] == ['as'] and cursor + 1 < len(members):
                        exported = members[cursor + 1]
                        cursor += 2
                    named_exports[exported] = local
                    if cursor < len(members) and members[cursor] != ',':
                        return False
                    cursor += 1
        if token in ('{', '(', '['):
            depth += 1
        elif token in ('}', ')', ']'):
            depth -= 1
        elif depth == 0 and token == 'export':
            following = tokens[index + 1 : index + 5]
            if name == 'default' and following[:1] == ['default']:
                return True
            if following[:1] == ['async']:
                following = following[1:]
            if (
                len(following) >= 2
                and following[0] in ('function', 'class', 'const', 'let', 'var')
                and following[1] == name
            ):
                return True
    return named_exports.get(name) in declarations


def _package_source(root: Path, package_name: str, export_name: str) -> str | None:
    """Prove a package subpath from a local manifest, explicit barrel and default implementation."""
    if not re.fullmatch(r'(?:@[a-z0-9._-]+/)?[a-z0-9._-]+', package_name):
        return None
    locations = [root, *[parent / 'node_modules' / package_name for parent in [root, *root.parents]]]
    for directory in locations:
        manifest = directory / 'package.json'
        if not manifest.is_file():
            continue
        try:
            package = json.loads(manifest.read_text())
        except (ValueError, OSError):
            continue
        if package.get('name') != package_name:
            continue

        def target(value) -> str | None:
            if isinstance(value, str):
                return value
            if isinstance(value, dict):
                for condition in ('dara-source', 'import', 'default'):
                    if condition in value:
                        return target(value[condition])
            return None

        entries = package.get('exports', {})
        if not isinstance(entries, dict):
            return None
        barrel = target(entries.get('.'))
        if not barrel:
            return None
        entry = _resolve_file(directory / barrel)
        if entry is None:
            return None
        exports, safe = _entry_exports(entry.read_text())
        if not safe or export_name not in exports:
            return None
        implementation, imported = exports[export_name]
        file = _resolve_file(entry.parent / implementation)
        if imported != 'default' or file is None or not _known_export(file.read_text(), 'default'):
            return None
        for subpath, value in entries.items():
            destination = target(value)
            if subpath.startswith('./') and '*' not in subpath and destination:
                exported_file = _resolve_file(directory / destination)
                if exported_file and exported_file.resolve() == file.resolve():
                    return package_name + subpath[1:]
        return None
    return None


def _remove_keyword(text: str, keyword: ast.keyword, call: ast.Call) -> tuple[int, int, str]:
    start, end = _span(text, keyword)
    _, call_end = _span(text, call)
    following = text[end : call_end - 1]
    match = re.match(r'\s*,', following)
    if match:
        return start, end + match.end(), ''
    preceding = text[:start]
    comma = re.search(r',\s*$', preceding)
    return (comma.start() if comma else start), end, ''


def _command(text: str, path: Path, plan: MigrationPlan) -> str:
    lines = text.splitlines(keepends=True)
    for index, original_line in enumerate(lines):
        line = original_line
        if 'dara start' not in line:
            continue
        if '--production' in line or '--skip-jsbuild' in line or '--rebuild' in line:
            plan.issues.append(
                MigrationIssue(
                    path,
                    index + 1,
                    'Split build/serve into dara build and dara start; use dara dev for development, or --backend-only for an API-only debugger.',
                )
            )
            continue
        if '--reload' in line or '--enable-hmr' in line:
            line = line.replace('dara start', 'dara dev')
            line = re.sub(r'\s+--(?:reload|enable-hmr)\b(?!-)', '', line)
            line = re.sub(r'\s+--dev-port(?:=|\s+)\d+', '', line)
        elif '--docker' in line:
            line = re.sub(r'\s+--docker\b', '', line)
            if '--require-sso' not in line:
                line = line.rstrip('\n') + ' --require-sso' + ('\n' if line.endswith('\n') else '')
            plan.notices.append(f'{path}: deployment now requires an earlier dara build step.')
        lines[index] = line
    return ''.join(lines)


def plan_migration(root: Path) -> MigrationPlan:
    """Inspect legacy files statically and propose only transformations with resolved sources."""
    root = root.resolve()
    plan = MigrationPlan(root)
    original: dict[Path, str | None] = {}
    proposed: dict[Path, str | None] = {}

    def read(path: Path) -> str | None:
        if path not in original:
            original[path] = path.read_text() if path.exists() else None
        return original[path]

    def write(path: Path, value: str | None) -> None:
        read(path)
        proposed[path] = value

    legacy_path = root / 'dara.config.json'
    legacy_text = read(legacy_path)
    try:
        legacy = json.loads(legacy_text) if legacy_text is not None else {}
        if not isinstance(legacy, dict):
            raise ValueError('expected an object')
    except ValueError as error:
        plan.issues.append(MigrationIssue(legacy_path, 1, f'Invalid legacy configuration: {error}'))
        return plan

    files = list(_files(root))
    modules: dict[Path, tuple[str, ast.Module]] = {}
    classes: dict[str, list[tuple[Path, ast.ClassDef]]] = {}
    registrations: list[tuple[Path, ast.Call, ast.keyword]] = []
    for path in files:
        if path.suffix != '.py':
            continue
        text = read(path)
        assert text is not None
        try:
            tree = ast.parse(text)
        except SyntaxError as error:
            plan.issues.append(
                MigrationIssue(path, error.lineno or 1, f'Fix Python syntax before migration: {error.msg}')
            )
            continue
        modules[path] = text, tree
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                classes.setdefault(node.name, []).append((path, node))
            elif (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in ('add_component', 'add_action')
            ):
                for keyword in node.keywords:
                    if keyword.arg == 'local':
                        registrations.append((path, node, keyword))

    has_declarations = any(
        assignment and assignment[0] in _LEGACY
        for definitions in classes.values()
        for _, cls in definitions
        for statement in cls.body
        if (assignment := _assignment(statement))
    )
    if legacy_text is None and not has_declarations and not registrations:
        return plan

    package_path = root / 'package.json'
    try:
        package_text = read(package_path)
        package = (
            json.loads(package_text)
            if package_text is not None
            else {'name': root.name.replace('_', '-').lower(), 'private': True, 'type': 'module'}
        )
        if not isinstance(package, dict):
            raise ValueError('expected an object')
    except ValueError as error:
        plan.issues.append(MigrationIssue(package_path, 1, f'Fix package.json: {error}'))
        return plan
    dependencies = package.setdefault('dependencies', {})
    extra = legacy.get('extra_dependencies', {})
    if (
        not isinstance(dependencies, dict)
        or not isinstance(extra, dict)
        or not all(isinstance(k, str) and isinstance(v, str) for k, v in extra.items())
    ):
        plan.issues.append(MigrationIssue(legacy_path, 1, 'Dependencies must map package names to string specifiers.'))
        return plan
    for name, specifier in extra.items():
        existing = next(
            (
                package.get(section, {}).get(name)
                for section in ('dependencies', 'devDependencies', 'peerDependencies')
                if name in package.get(section, {})
            ),
            None,
        )
        if existing is not None and existing != specifier:
            plan.issues.append(
                MigrationIssue(
                    package_path,
                    1,
                    f'{name}: keep one requirement; package.json has {existing}, legacy config has {specifier}.',
                )
            )
        elif existing is None:
            dependencies[name] = specifier
    scripts = package.get('scripts', {})
    if not isinstance(scripts, dict) or not all(isinstance(value, str) for value in scripts.values()):
        plan.issues.append(MigrationIssue(package_path, 1, 'package.json scripts must contain string commands.'))
        return plan
    for name, command in scripts.items():
        package['scripts'][name] = _command(command, package_path, plan)
    if package != json.loads(read(package_path) or '{}'):
        write(package_path, json_text(package))

    unknown = set(legacy) - {'extra_dependencies', 'local_entry', 'package_manager'}
    for key in sorted(unknown):
        plan.issues.append(
            MigrationIssue(legacy_path, 1, f'Resolve the customized {key!r} setting, then remove that key.')
        )
    if legacy.get('package_manager', 'pnpm') not in ('pnpm', 'npm', 'yarn'):
        plan.issues.append(
            MigrationIssue(legacy_path, 1, 'Resolve the custom package manager before removing legacy configuration.')
        )
    for name in ('package-lock.json', 'yarn.lock'):
        if (root / name).exists():
            plan.notices.append(
                f'{name} is preserved. dara dev creates a new pnpm resolution; review and commit it, then remove the obsolete lockfile.'
            )

    entry_value = legacy.get('local_entry', './js')
    if not isinstance(entry_value, str):
        plan.issues.append(MigrationIssue(legacy_path, 1, 'local_entry must be a statically known local directory.'))
        return plan
    old_directory = (root / entry_value).resolve()
    target_directory = root / 'js'
    if not old_directory.is_relative_to(root) or old_directory == root:
        plan.issues.append(
            MigrationIssue(legacy_path, 1, 'Move local_entry inside the app, under js/, and update its imports.')
        )
        return plan
    if target_directory.is_symlink():
        plan.issues.append(
            MigrationIssue(
                target_directory, 1, 'Replace the js/ symlink with an app-owned source directory before migration.'
            )
        )
        return plan
    move = old_directory != target_directory
    if (
        move
        and target_directory.exists()
        and any(
            (target_directory / file.relative_to(old_directory)).exists()
            and (target_directory / file.relative_to(old_directory)).read_bytes() != file.read_bytes()
            for file in _files(old_directory)
        )
    ):
        plan.issues.append(
            MigrationIssue(
                legacy_path, 1, 'Both local_entry and js/ exist. Merge them manually and set local_entry to ./js.'
            )
        )
        return plan
    if move:
        # Relative imports inside a whole relocated tree remain valid. External references do not.
        references = [
            p
            for p in files
            if not p.is_relative_to(old_directory)
            and p != legacy_path
            and p.suffix in ('.py', '.ts', '.tsx', '.json')
            and entry_value in (read(p) or '')
        ]
        if references:
            for path in references:
                plan.issues.append(
                    MigrationIssue(
                        path, 1, f'Rewrite the reference to {entry_value} before moving the local source tree to js/.'
                    )
                )
            return plan
        for path in _files(old_directory):
            try:
                content = read(path)
            except UnicodeDecodeError:
                plan.issues.append(
                    MigrationIssue(path, 1, 'Move this binary asset and its enclosing source tree to js/ manually.')
                )
                return plan
            write(target_directory / path.relative_to(old_directory), content)
            write(path, None)

    entry = _resolve_file(old_directory / 'index')
    exports: dict[str, tuple[str, str]] = {}
    if entry:
        entry_text = read(entry)
        assert entry_text is not None
        exports, safe = _entry_exports(entry_text)
        if not safe:
            plan.issues.append(
                MigrationIssue(
                    entry,
                    1,
                    'Entry contains executable statements or ambiguous exports. Move implementations into separate modules and leave explicit re-exports plus setup/style imports in the entry.',
                )
            )
    elif registrations or has_declarations:
        plan.issues.append(
            MigrationIssue(
                legacy_path,
                1,
                'Cannot find the local entry. Set local_entry to a directory with an explicit index.tsx barrel or add js_source manually.',
            )
        )

    edits: dict[Path, list[tuple[int, int, str]]] = {}
    converted: set[tuple[Path, str]] = set()
    local_names = {
        call.args[0].id
        for _, call, keyword in registrations
        if call.args and isinstance(call.args[0], ast.Name) and _literal(keyword.value) is True
    }
    for name, definitions in classes.items():
        for path, cls in definitions:
            text, _ = modules[path]
            assignments = {
                assignment[0]: (statement, assignment[1])
                for statement in cls.body
                if (assignment := _assignment(statement))
            }
            if 'js_source' in assignments:
                current_source = _literal(assignments['js_source'][1])
                try:
                    if not isinstance(current_source, str):
                        raise ValueError('expected a string literal')
                    parse_js_source(current_source)
                except ValueError as error:
                    plan.issues.append(
                        MigrationIssue(path, cls.lineno, f'{name}: resolve js_source before removing local=: {error}')
                    )
                    continue
                if _LEGACY.intersection(assignments):
                    plan.issues.append(
                        MigrationIssue(
                            path,
                            cls.lineno,
                            f'{name}: remove legacy declarations after reviewing the existing js_source.',
                        )
                    )
                else:
                    converted.add((path, name))
                continue
            legacy_nodes = [assignments[key][0] for key in _LEGACY if key in assignments]
            if not legacy_nodes and name not in local_names:
                continue
            values = {
                key: _literal(value)
                for key, (_, value) in assignments.items()
                if key in _LEGACY | {'py_component', 'py_name'}
            }
            if any(value is ... for value in values.values()):
                plan.issues.append(
                    MigrationIssue(
                        path,
                        cls.lineno,
                        f'{name}: replace dynamic metadata with a literal js_source; preserve runtime naming overrides.',
                    )
                )
                continue
            export_name = values.get('js_component') or values.get('py_name') or values.get('py_component') or name
            module = values.get('js_module')
            if module is not None:
                source = (
                    _package_source(root, module, export_name)
                    if isinstance(module, str) and isinstance(export_name, str)
                    else None
                )
                if source is None:
                    plan.issues.append(
                        MigrationIssue(
                            path,
                            cls.lineno,
                            f'{name}: inspect {module!r} and set js_source to a verified default-export component/action subpath. Install the package first if its exports are not available locally.',
                        )
                    )
                    continue
            else:
                if not isinstance(export_name, str) or export_name not in exports or entry is None:
                    plan.issues.append(
                        MigrationIssue(
                            path,
                            cls.lineno,
                            f'{name}: no unique explicit re-export for {export_name!r}; add a default-export implementation and literal js_source.',
                        )
                    )
                    continue
                specifier, imported = exports[export_name]
                if not specifier.startswith('.'):
                    plan.issues.append(
                        MigrationIssue(
                            path,
                            cls.lineno,
                            f'{name}: external re-export {specifier!r} needs a verified default-export package subpath.',
                        )
                    )
                    continue
                implementation = _resolve_file(entry.parent / specifier)
                if (
                    implementation is None
                    or not implementation.resolve().is_relative_to(old_directory)
                    or not _known_export(read(implementation) or '', imported)
                ):
                    plan.issues.append(
                        MigrationIssue(
                            path,
                            cls.lineno,
                            f'{name}: cannot prove export {imported!r} from {specifier!r}; add js_source manually.',
                        )
                    )
                    continue
                destination = target_directory / implementation.relative_to(old_directory)
                if imported == 'default':
                    source = './' + destination.relative_to(root).as_posix()
                else:
                    key = hashlib.sha256(f'{destination.relative_to(root)}:{imported}'.encode()).hexdigest()[:12]
                    adapter = target_directory / 'dara-adapters' / f'{key}.ts'
                    relative = os.path.relpath(destination.with_suffix(''), adapter.parent).replace(os.sep, '/')
                    adapter_text = f'// Generated by dara migrate; preserves the existing named export.\nexport {{ {imported} as default }} from {json.dumps(relative)};\n'
                    existing = read(adapter)
                    if existing is not None and existing != adapter_text:
                        plan.issues.append(
                            MigrationIssue(
                                adapter, 1, 'Adapter already exists with different contents; choose js_source manually.'
                            )
                        )
                        continue
                    write(adapter, adapter_text)
                    source = './' + adapter.relative_to(root).as_posix()
            file_edits = edits.setdefault(path, [])
            if legacy_nodes:
                first, *remaining = sorted(legacy_nodes, key=lambda node: node.lineno)
                start, end = _span(text, first)
                file_edits.append((start, end, f'js_source = {source!r}'))
                for node in remaining:
                    start, end = _span(text, node)
                    file_edits.append((start, end, ''))
            else:
                first = (
                    cls.body[1]
                    if len(cls.body) > 1
                    and isinstance(cls.body[0], ast.Expr)
                    and isinstance(cls.body[0].value, ast.Constant)
                    and isinstance(cls.body[0].value.value, str)
                    else cls.body[0]
                )
                start, _ = _span(text, first)
                indent = ' ' * first.col_offset
                file_edits.append((start, start, f'js_source = {source!r}\n{indent}'))
            converted.add((path, name))

    for path, call, keyword in registrations:
        if _literal(keyword.value) is not True or not call.args or not isinstance(call.args[0], ast.Name):
            plan.issues.append(
                MigrationIssue(
                    path,
                    call.lineno,
                    'Resolve the registration target/local flag and add its literal js_source before removing local=.',
                )
            )
            continue
        name = call.args[0].id
        candidates = classes.get(name, [])
        # Same-file classes are unambiguous; otherwise only a unique app declaration is supported.
        same_file = [(p, cls) for p, cls in candidates if p == path]
        selected = same_file or candidates
        if len(selected) != 1 or (selected[0][0], name) not in converted:
            plan.issues.append(
                MigrationIssue(
                    path, call.lineno, f'Keep this registration. Set {name}.js_source, then remove only local=True.'
                )
            )
            continue
        text, _ = modules[path]
        edits.setdefault(path, []).append(_remove_keyword(text, keyword, call))
    for path, replacements in edits.items():
        write(path, _apply_edits(modules[path][0], replacements))

    pyproject_path = root / 'pyproject.toml'
    pyproject_text = read(pyproject_path) or ''
    if modules:
        try:
            metadata = toml.loads(pyproject_text)
            if not metadata.get('tool', {}).get('dara', {}).get('config'):
                candidates = []
                for path, (_, tree) in modules.items():
                    for node in tree.body:
                        assignment = _assignment(node)
                        if (
                            assignment
                            and assignment[0] == 'config'
                            and isinstance(assignment[1], ast.Call)
                            and isinstance(assignment[1].func, ast.Name)
                            and assignment[1].func.id == 'ConfigurationBuilder'
                        ):
                            module = '.'.join(path.relative_to(root).with_suffix('').parts)
                            candidates.append(f'{module}:config')
                if len(candidates) == 1:
                    setting = f'config = {json.dumps(candidates[0])}\n'
                    header = re.search(r'^\[tool\.dara\][ \t]*\n', pyproject_text, re.M)
                    if header:
                        write(pyproject_path, pyproject_text[: header.end()] + setting + pyproject_text[header.end() :])
                    else:
                        write(pyproject_path, pyproject_text.rstrip() + '\n\n[tool.dara]\n' + setting)
                else:
                    plan.issues.append(
                        MigrationIssue(
                            pyproject_path,
                            1,
                            'Set [tool.dara] config = "module:object"; the Python configuration reference is ambiguous.',
                        )
                    )
        except toml.TomlDecodeError as error:
            plan.issues.append(MigrationIssue(pyproject_path, 1, f'Fix TOML before adding [tool.dara]: {error}'))

    for path in files:
        if path.suffix in ('.sh', '.fish') or path.name in ('Makefile', 'Dockerfile'):
            text = read(path)
            assert text is not None
            changed = _command(text, path, plan)
            if changed != text:
                write(path, changed)
    vite_path = root / 'vite.config.ts'
    vite_text = read(vite_path)
    if vite_text is not None and '@darajs/vite-plugin' not in vite_text:
        plan.issues.append(
            MigrationIssue(
                vite_path,
                1,
                'Add the Dara Vite plugin to this customized configuration; move library builds to vite.lib.config.ts with a separate output.',
            )
        )
    if move and plan.issues:
        # Keep the source tree and every reference together until all moves are resolved.
        return plan
    if legacy_text is not None and not plan.issues:
        write(legacy_path, None)
    # New destinations precede references, and removals follow all successful writes.
    plan.changes = [Change(path, original[path], after) for path, after in proposed.items() if original[path] != after]
    plan.changes.sort(
        key=lambda change: (
            change.after is None,
            change.before is not None,
            change.path == legacy_path,
            str(change.path),
        )
    )
    return plan
