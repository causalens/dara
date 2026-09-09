"""Prove supported JavaScript sources without executing user code or guessing module identities."""

import hashlib
import json
import os
import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from dara.core.js_tooling.migration_plan import MigrationIssue, MigrationPlan, SourceRequest

# Vite 8's DEFAULT_EXTENSIONS, also used for directory index resolution. Keep the
# actual selected filename in every generated import rather than resolving twice.
_EXTENSIONS = ('.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json')
_IDENTIFIER = re.compile(r'[A-Za-z_$][\w$]*')
_LEXEME = re.compile(r'\s+|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|=>|&&|\|\||\?\?|.', re.S)
_REGEX_PREFIX = {
    '',
    '=',
    '(',
    '[',
    '{',
    ',',
    ';',
    ':',
    '!',
    '?',
    '&&',
    '||',
    '??',
    '=>',
    '+',
    '-',
    '*',
    '%',
    '&',
    '|',
    '^',
    '~',
    '<',
    '>',
    'return',
    'throw',
    'case',
    'delete',
    'void',
    'typeof',
    'in',
    'of',
    'yield',
    'await',
    'else',
    'do',
}


@dataclass(frozen=True)
class _Export:
    source: str
    name: str


def _token(text: str, offset: int, previous: str) -> tuple[str | None, int]:
    """Read opaque JS literals; ambiguous slash contexts are deliberately unsupported."""
    start = offset
    char = text[offset]
    if char in ('"', "'"):
        offset += 1
        while offset < len(text):
            if text[offset] == '\\':
                offset += 2
            elif text[offset] == char:
                return text[start : offset + 1], offset + 1
            elif text[offset] in '\r\n':
                raise ValueError('Unterminated string')
            else:
                offset += 1
        raise ValueError('Unterminated string')
    if char == '`':
        offset += 1
        while offset < len(text):
            if text[offset] == '\\':
                offset += 2
            elif text[offset] == '`':
                return text[start : offset + 1], offset + 1
            elif text.startswith('${', offset):
                offset += 2
                depth, preceding = 1, ''
                while offset < len(text) and depth:
                    value, offset = _token(text, offset, preceding)
                    if value is not None:
                        depth += (value == '{') - (value == '}')
                        preceding = value
                if depth:
                    raise ValueError('Unterminated template expression')
            else:
                offset += 1
        raise ValueError('Unterminated template')
    if char == '/' and not text.startswith(('//', '/*'), offset):
        if previous == '<' and re.match(r'/(?:[A-Za-z][\w.:-]*)?\s*>', text[offset:]):
            return '/', offset + 1
        if previous in (')', '}'):
            raise ValueError('Ambiguous regular expression or division')
        if previous in _REGEX_PREFIX:
            offset += 1
            character_class = False
            while offset < len(text):
                value = text[offset]
                if value == '\\':
                    offset += 2
                    continue
                if value in '\r\n':
                    raise ValueError('Unterminated regular expression')
                if value == '[':
                    character_class = True
                elif value == ']':
                    character_class = False
                elif value == '/' and not character_class:
                    offset += 1
                    while offset < len(text) and text[offset].isalpha():
                        offset += 1
                    return text[start:offset], offset
                offset += 1
            raise ValueError('Unterminated regular expression')
    match = _LEXEME.match(text, offset)
    assert match is not None
    value = match.group()
    if value.isspace() or value.startswith(('//', '/*')):
        return None, match.end()
    return value, match.end()


def _tokens(text: str) -> list[str] | None:
    result: list[str] = []
    offset = 0
    try:
        while offset < len(text):
            value, offset = _token(text, offset, result[-1] if result else '')
            if value is not None:
                result.append(value)
    except ValueError:
        return None
    return result


def _string(token: str) -> str | None:
    if token[:1] not in ('"', "'") or '\\' in token:
        return None
    return token[1:-1]


def _entry_exports(text: str) -> tuple[dict[str, _Export], bool]:
    """Accept a small explicit-barrel grammar, retaining every setup/style import."""
    tokens = _tokens(text)
    if tokens is None:
        return {}, False
    exports: dict[str, _Export] = {}
    index = 0
    while index < len(tokens):
        if tokens[index] == ';':
            index += 1
            continue
        if tokens[index] == 'import':
            end = index + 1
            while end < len(tokens) and tokens[end] != ';':
                end += 1
            imported = tokens[index + 1 : end]
            if end == len(tokens) or not (
                (len(imported) == 1 and _string(imported[0]) is not None)
                or (
                    len(imported) >= 3
                    and imported[-2] == 'from'
                    and _string(imported[-1]) is not None
                    and '(' not in imported
                    and 'export' not in imported
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
        source = _string(tokens[end + 2])
        if source is None:
            return exports, False
        while members:
            if members[0] == ',':
                members = members[1:]
                continue
            original = members.pop(0)
            exported = original
            if members[:1] == ['as'] and len(members) >= 2:
                exported, members = members[1], members[2:]
            if members and members[0] != ',':
                return exports, False
            if not _IDENTIFIER.fullmatch(original) or not _IDENTIFIER.fullmatch(exported) or exported in exports:
                return exports, False
            exports[exported] = _Export(source, original)
        index = end + 3
    return exports, True


def _resolve_file(base: Path) -> Path | None:
    if base.is_file():
        return base
    for extension in _EXTENSIONS:
        candidate = Path(str(base) + extension)
        if candidate.is_file():
            return candidate
    # A directory package can override index resolution. That requires manual
    # review instead of pretending this limited resolver implements package mains.
    if base.is_dir() and not (base / 'package.json').exists():
        return next((base / ('index' + ext) for ext in _EXTENSIONS if (base / ('index' + ext)).is_file()), None)
    return None


def _known_export(text: str, name: str) -> bool:
    tokens = _tokens(text)
    if tokens is None:
        return False
    depth = 0
    variable_type = False
    declarations: set[str] = set()
    aliases: dict[str, str] = {}
    for index, token in enumerate(tokens):
        # JSX text is not JavaScript. Stop before an unparenthesized JSX expression
        # can masquerade as a declaration; direct exported components are proven
        # at their declaration, before inspecting their JSX bodies.
        if depth == 0 and (token == 'declare' or (token == '<' and not variable_type)):
            return False
        if depth == 0 and token in ('=', ';'):
            variable_type = False
        if depth == 0 and token in ('const', 'let', 'var', 'function', 'class') and index + 1 < len(tokens):
            declarations.add(tokens[index + 1])
            # A variable's explicit type ends at its initializer. Generic type
            # arguments here cannot be JSX, including ActionHandler<Impl>.
            variable_type = token in ('const', 'let', 'var') and tokens[index + 2 : index + 3] == [':']
        if depth == 0 and tokens[index : index + 2] == ['export', '{']:
            end = index + 2
            while end < len(tokens) and tokens[end] != '}':
                end += 1
            if end < len(tokens) and tokens[end + 1 : end + 2] != ['from']:
                members, cursor = tokens[index + 2 : end], 0
                while cursor < len(members):
                    local = members[cursor]
                    cursor += 1
                    exported = local
                    if members[cursor : cursor + 1] == ['as'] and cursor + 1 < len(members):
                        exported, cursor = members[cursor + 1], cursor + 2
                    if not _IDENTIFIER.fullmatch(local) or not _IDENTIFIER.fullmatch(exported):
                        return False
                    aliases[exported] = local
                    if cursor < len(members) and members[cursor] != ',':
                        return False
                    cursor += 1
        if token in ('{', '(', '['):
            depth += 1
        elif token in ('}', ')', ']'):
            depth -= 1
        elif depth == 0 and token == 'export':
            following = tokens[index + 1 : index + 5]
            if name == 'default' and len(following) > 1 and following[0] == 'default':
                return following[1] not in ('interface', 'type', 'declare')
            if following[:1] == ['async']:
                following = following[1:]
            if (
                len(following) >= 2
                and following[0] in ('function', 'class', 'const', 'let', 'var')
                and following[1] == name
            ):
                return True
    return aliases.get(name) in declarations


def _target(value) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        # Conditional exports are evaluated in declaration order, not priority
        # order. Unknown potentially-active conditions cannot prove an identity.
        for condition, branch in value.items():
            if condition in ('types', 'require'):
                continue
            if condition in ('dara-source', 'import', 'default'):
                return _target(branch)
            return None
    return None


def _package_file(directory: Path, target: str | None) -> Path | None:
    if (
        target is None
        or not target.startswith('./')
        or not (directory / target).resolve().is_relative_to(directory.resolve())
    ):
        return None
    return _resolve_file(directory / target)


def _references(text: str) -> list[tuple[str, int]]:
    """Find literal relative paths conservatively, including CSS URLs and HTML attributes."""
    references = []
    for match in re.finditer(r'([\'"`])((?:\\.|(?!\1)[\s\S])*?)\1', text):
        value = match[2]
        if value.startswith(('./', '../', '\\u', '\\x', '.\\')) or value in ('.', '..'):
            references.append((value, match.start(2)))
    # URL contexts also accept bare relative paths: src="frontend/app.tsx" and
    # url(fonts/body.woff). Do not apply this rule to arbitrary JS strings.
    for match in re.finditer(
        r'(?:\burl\(\s*|\b(?:src|href)\s*=\s*)(?:([\'"])(.*?)\1|([^\s\'"`()<>]+))', text, re.I | re.S
    ):
        group = 2 if match[1] else 3
        value = match[group]
        if value and not re.match(r'(?:[A-Za-z][A-Za-z0-9+.-]*:|[/#?])', value):
            references.append((value, match.start(group)))
    return list(dict.fromkeys(references))


class JavaScriptSources:
    """Resolve registrations against one snapshotted entry and preserve its initialization."""

    def __init__(self, plan: MigrationPlan, source_root: Path, destination_root: Path):
        self.plan = plan
        self.source_root = source_root
        self.destination_root = destination_root
        self.entry = _resolve_file(source_root / 'index')
        self.exports: dict[str, _Export] = {}
        self.safe_entry = True
        if self.entry is not None:
            self.exports, self.safe_entry = _entry_exports(plan.read(self.entry) or '')
            if not self.safe_entry:
                plan.issues.append(
                    MigrationIssue(
                        self.entry,
                        1,
                        'Entry contains executable statements or ambiguous exports. Move implementations into separate modules and leave explicit re-exports plus setup/style imports in the entry.',
                    )
                )

    def _issue(self, request: SourceRequest, message: str) -> None:
        self.plan.issues.append(MigrationIssue(request.path, request.line, f'{request.class_name}: {message}'))

    def prepare_entry(self) -> None:
        """Keep a non-TSX legacy entry reachable from the new fixed index.tsx."""
        if self.entry is None or not self.safe_entry or self.entry.name == 'index.tsx':
            return
        if self.entry.suffix in ('.ts', '.mts', '.cts') and not self._allows_typed_imports():
            self.plan.issues.append(
                MigrationIssue(
                    self.entry,
                    1,
                    'Set compilerOptions.allowImportingTsExtensions to true in tsconfig.json (or extend @darajs/vite-plugin/tsconfig.json) before forwarding this legacy entry from index.tsx.',
                )
            )
            return
        fixed = self.destination_root / 'index.tsx'
        wrapper = f'// Generated by dara migrate; preserves setup and styles in the legacy entry.\nimport "./{self.entry.name}";\n'
        existing = self.plan.read(fixed)
        source_fixed = self.source_root / 'index.tsx'
        incoming = self.plan.read(source_fixed) if source_fixed != fixed else existing
        if any(value is not None and value != wrapper for value in (existing, incoming)):
            self.plan.issues.append(
                MigrationIssue(
                    fixed,
                    1,
                    'Keep the existing index.tsx and import the legacy entry/setup explicitly; migration will not overwrite either file.',
                )
            )
            return
        self.plan.write(fixed, wrapper)

    def check_relocation(self, files: Iterable[Path]) -> None:
        """Reject relative references whose destination changes outside the relocated tree."""
        if self.source_root == self.destination_root:
            return
        for file in files:
            text = self.plan.read(file) or ''
            destination = self.destination_root / file.relative_to(self.source_root)
            for reference, offset in _references(text):
                line = text.count('\n', 0, offset) + 1
                if '\\' in reference or '${' in reference:
                    self.plan.issues.append(
                        MigrationIssue(
                            file,
                            line,
                            'Resolve this dynamic/escaped relative reference before moving the source tree to js/.',
                        )
                    )
                    continue
                pathname = re.split(r'[?#]', reference, maxsplit=1)[0]
                before = (file.parent / pathname).resolve()
                after = (destination.parent / pathname).resolve()
                if not before.is_relative_to(self.source_root) and before != after:
                    self.plan.issues.append(
                        MigrationIssue(
                            file,
                            line,
                            f'Rewrite the external relative reference {reference!r} before moving the source tree to js/.',
                        )
                    )

    def check_external_references(self, files: Iterable[Path]) -> None:
        """Reject inbound relative references that would keep pointing at the removed source tree."""
        if self.source_root == self.destination_root:
            return
        for file in files:
            if file.is_relative_to(self.source_root) or file.is_relative_to(self.destination_root):
                continue
            if file.suffix not in {
                '.js',
                '.jsx',
                '.ts',
                '.tsx',
                '.mjs',
                '.mts',
                '.cjs',
                '.cts',
                '.css',
                '.scss',
                '.sass',
                '.less',
                '.html',
                '.svg',
                '.json',
            }:
                continue
            text = self.plan.read(file) or ''
            for reference, offset in _references(text):
                target = (file.parent / re.split(r'[?#]', reference, maxsplit=1)[0]).resolve()
                if target.is_relative_to(self.source_root) or '\\' in reference or '${' in reference:
                    self.plan.issues.append(
                        MigrationIssue(
                            file,
                            text.count('\n', 0, offset) + 1,
                            f'Rewrite the reference {reference!r} to the relocated js/ source before migration.',
                        )
                    )

    def _package_source(self, package_name: str, export_name: str) -> str | None:
        if not re.fullmatch(r'(?:@[a-z0-9._-]+/)?[a-z0-9._-]+', package_name):
            return None
        root = self.plan.root
        for directory in [root, *[parent / 'node_modules' / package_name for parent in [root, *root.parents]]]:
            manifest = directory / 'package.json'
            if not manifest.is_file():
                continue
            try:
                package = json.loads(self.plan.read(manifest) or '{}')
            except ValueError:
                continue
            if not isinstance(package, dict) or package.get('name') != package_name:
                continue
            entries = package.get('exports', {})
            if not isinstance(entries, dict):
                return None
            barrel = _package_file(directory, _target(entries.get('.')))
            if barrel is None:
                return None
            exports, safe = _entry_exports(self.plan.read(barrel) or '')
            if not safe or export_name not in exports:
                return None
            implementation = exports[export_name]
            file = (
                _resolve_file(barrel.parent / implementation.source) if implementation.source.startswith('.') else None
            )
            if (
                implementation.name != 'default'
                or file is None
                or not _known_export(self.plan.read(file) or '', 'default')
            ):
                return None
            for subpath, value in entries.items():
                if subpath.startswith('./') and '*' not in subpath:
                    candidate = _package_file(directory, _target(value))
                    if candidate is not None and candidate.resolve() == file.resolve():
                        return package_name + subpath[1:]
            return None
        return None

    def resolve(self, request: SourceRequest) -> str | None:
        """Return a proven default-export specifier, proposing an adapter only when necessary."""
        if request.module is not None:
            source = self._package_source(request.module, request.export_name)
            if source is None:
                self._issue(
                    request,
                    f'Inspect {request.module!r} and set js_source to a verified default-export component/action subpath. Install the package first if its exports are not available locally.',
                )
            return source
        if self.entry is None or not self.safe_entry or request.export_name not in self.exports:
            self._issue(
                request,
                f'No unique explicit re-export for {request.export_name!r}; add a default-export implementation and literal js_source.',
            )
            return None
        exported = self.exports[request.export_name]
        if not exported.source.startswith('.'):
            self._issue(
                request, f'External re-export {exported.source!r} needs a verified default-export package subpath.'
            )
            return None
        implementation = _resolve_file(self.entry.parent / exported.source)
        if (
            implementation is None
            or not implementation.resolve().is_relative_to(self.source_root)
            or not _known_export(self.plan.read(implementation) or '', exported.name)
        ):
            self._issue(
                request, f'Cannot prove export {exported.name!r} from {exported.source!r}; add js_source manually.'
            )
            return None
        destination = self.destination_root / implementation.relative_to(self.source_root)
        if exported.name == 'default':
            return './' + destination.relative_to(self.plan.root).as_posix()
        if destination.suffix in ('.ts', '.tsx', '.mts', '.cts') and not self._allows_typed_imports():
            self._issue(
                request,
                'Set compilerOptions.allowImportingTsExtensions to true in tsconfig.json (or extend @darajs/vite-plugin/tsconfig.json) before generating an adapter with the exact TypeScript source extension.',
            )
            return None
        key = hashlib.sha256(f'{destination.relative_to(self.plan.root)}:{exported.name}'.encode()).hexdigest()[:12]
        adapter = self.destination_root / 'dara-adapters' / f'{key}.ts'
        relative = os.path.relpath(destination, adapter.parent).replace(os.sep, '/')
        content = f'// Generated by dara migrate; preserves the existing named export.\nexport {{ {exported.name} as default }} from {json.dumps(relative)};\n'
        existing = self.plan.read(adapter)
        if existing is not None and existing != content:
            self._issue(
                request, f'Keep customized adapter {adapter.relative_to(self.plan.root)} and set js_source manually.'
            )
            return None
        self.plan.write(adapter, content)
        return './' + adapter.relative_to(self.plan.root).as_posix()

    def _allows_typed_imports(self) -> bool:
        text = self.plan.read(self.plan.root / 'tsconfig.json')
        if text is None:
            return True  # The normal initializer creates the plugin preset.
        try:
            config = json.loads(text)
        except ValueError:
            return False
        if not isinstance(config, dict) or not isinstance(config.get('compilerOptions', {}), dict):
            return False
        option = config.get('compilerOptions', {}).get('allowImportingTsExtensions')
        if option is not None:
            return option is True
        return config.get('extends') == '@darajs/vite-plugin/tsconfig.json'
