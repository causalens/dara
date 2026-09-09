"""Plan conservative source migrations without importing or executing the legacy application."""

import json
import os
import re
from pathlib import Path
from typing import Any, TypeVar

import toml
from pydantic import Field

import click
from dara.core.js_tooling.migration_commands import rewrite_command
from dara.core.js_tooling.migration_javascript import JavaScriptSources
from dara.core.js_tooling.migration_plan import Change, MigrationIssue, MigrationPlan, MigrationReadError
from dara.core.js_tooling.migration_python import PythonSources, analyze_python, apply_sources, configuration_reference
from dara.core.js_tooling.models import ProjectError
from dara.core.js_tooling.project import json_text
from dara.core.js_tooling.project_files import PackageFields, ProjectFields, PythonProjectFields

_EXCLUDED = {'.git', '.venv', 'node_modules', 'dist', '__pycache__', '.dara'}
_Fields = TypeVar('_Fields', bound=ProjectFields)

# Retain the public plan types at the original import location.
__all__ = ['Change', 'MigrationIssue', 'MigrationPlan', 'plan_migration']


class _LegacyFields(ProjectFields):
    local_entry: str = './js'
    extra_dependencies: dict[str, str] = Field(default_factory=dict)
    package_manager: str = 'pnpm'


class _ScriptsFields(ProjectFields):
    scripts: dict[str, str] = Field(default_factory=dict)


class _MigrationPackageFields(PackageFields):
    peerDependencies: dict[str, str] = Field(default_factory=dict)


def _files(root: Path):
    def failed(error: OSError) -> None:
        path = Path(error.filename) if error.filename else root
        raise MigrationReadError(MigrationIssue(path, 1, f'Cannot inspect source directory: {error}'))

    for directory, children, files in os.walk(root, followlinks=False, onerror=failed):
        children[:] = sorted(
            name
            for name in children
            if name not in _EXCLUDED and not name.startswith('.') and not (Path(directory) / name).is_symlink()
        )
        for name in sorted(files):
            path = Path(directory) / name
            if not path.is_symlink():
                yield path


def _json(path: Path, plan: MigrationPlan) -> dict[str, Any]:
    try:
        text = plan.read(path)
        value = json.loads(text if text is not None else '{}')
        if not isinstance(value, dict):
            raise ValueError('expected an object')
        return value
    except ValueError as error:
        raise MigrationReadError(MigrationIssue(path, 1, f'Fix JSON before migration: {error}')) from error


def _parse(model: type[_Fields], value: Any, path: Path) -> _Fields:
    try:
        return model.parse(value, path)
    except ProjectError as error:
        raise MigrationReadError(MigrationIssue(path, 1, str(error))) from error


def _command(text: str, path: Path, plan: MigrationPlan) -> str:
    lines = []
    for number, line in enumerate(text.splitlines(keepends=True), start=1):
        result = rewrite_command(line)
        lines.append(result.text)
        if result.issue:
            plan.issues.append(MigrationIssue(path, number, result.issue))
        if result.notice:
            plan.notices.append(f'{path}: {result.notice}')
    return ''.join(lines)


def _package(plan: MigrationPlan, extra: dict[str, str]) -> None:
    path = plan.root / 'package.json'
    original = _json(path, plan)
    package = dict(original)
    scripts = _parse(_ScriptsFields, package, path).scripts
    if scripts:
        package['scripts'] = {name: _command(command, path, plan) for name, command in scripts.items()}
    if extra:
        fields = _parse(_MigrationPackageFields, package, path)
        sections = {**fields.dependency_sections, 'peerDependencies': fields.peerDependencies}
        additions = {}
        for name, specifier in extra.items():
            existing = [entries[name] for entries in sections.values() if name in entries]
            if any(value != specifier for value in existing):
                plan.issues.append(
                    MigrationIssue(
                        path,
                        1,
                        f'{name}: keep one requirement; package.json has {", ".join(existing)}, legacy config has {specifier}.',
                    )
                )
            elif not existing:
                additions[name] = specifier
        if additions:
            if plan.read(path) is None:
                package.update(name=plan.root.name.replace('_', '-').lower(), private=True, type='module')
            package['dependencies'] = {**fields.dependencies, **additions}
    if package != original:
        plan.write(path, json_text(package))


def _configuration(plan: MigrationPlan, sources: PythonSources) -> None:
    path = plan.root / 'pyproject.toml'
    text = plan.read(path) or ''
    try:
        metadata = toml.loads(text)
    except toml.TomlDecodeError as error:
        raise MigrationReadError(MigrationIssue(path, 1, f'Fix TOML before adding [tool.dara]: {error}')) from error
    settings = _parse(PythonProjectFields, metadata, path)
    reference = settings.tool.dara.config
    if reference is not None:
        if not re.fullmatch(r'[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*', reference):
            plan.issues.append(
                MigrationIssue(path, 1, 'Set [tool.dara] config to a literal "module:object" reference.')
            )
        return
    reference = configuration_reference(sources, plan)
    if reference is None:
        return
    newline = '\r\n' if '\r\n' in text else '\n'
    setting = f'config = {json.dumps(reference)}{newline}'
    header = re.search(r'^\[tool\.dara\][ \t]*(?:#[^\r\n]*)?\r?\n', text, re.M)
    if header:
        updated = text[: header.end()] + setting + text[header.end() :]
    else:
        updated = text.rstrip() + newline * 2 + '[tool.dara]' + newline + setting
    try:
        parsed = toml.loads(updated)
        if _parse(PythonProjectFields, parsed, path).tool.dara.config != reference:
            raise ValueError('the config setting is already declared elsewhere')
    except (toml.TomlDecodeError, ValueError) as error:
        plan.issues.append(
            MigrationIssue(path, 1, f'Add config = {json.dumps(reference)} to the existing Dara settings: {error}')
        )
        return
    plan.write(path, updated)


def _plan(plan: MigrationPlan, analyze_javascript: bool) -> None:
    root = plan.root
    files = list(_files(root))
    legacy_path = root / 'dara.config.json'
    legacy = _json(legacy_path, plan)
    fields = _parse(_LegacyFields, legacy, legacy_path)
    source_directory = root / fields.local_entry
    old_directory = source_directory.resolve()
    target_directory = root / 'js'
    move = old_directory != target_directory
    sources = analyze_python(files, plan)
    # Commands can be the only legacy feature left after a manual migration.
    _package(plan, fields.extra_dependencies)
    for path in files:
        if move and path.is_relative_to(old_directory):
            continue
        if path.suffix in ('.sh', '.fish') or path.name in ('Makefile', 'Dockerfile'):
            text = plan.read(path)
            assert text is not None
            updated = _command(text, path, plan)
            if updated != text:
                plan.write(path, updated)
    if plan.read(legacy_path) is None and not sources.needed:
        plan.finish()
        return
    if not analyze_javascript:
        raise MigrationReadError(
            MigrationIssue(
                legacy_path if plan.read(legacy_path) is not None else root,
                1,
                'Legacy declarations require migration. Run dara lock without frozen mode, review the changes, then retry frozen development.',
            )
        )
    for key in sorted(set(legacy) - {'extra_dependencies', 'local_entry', 'package_manager'}):
        plan.issues.append(
            MigrationIssue(legacy_path, 1, f'Resolve the customized {key!r} setting, then remove that key.')
        )
    if fields.package_manager not in ('pnpm', 'npm', 'yarn'):
        plan.issues.append(
            MigrationIssue(legacy_path, 1, 'Resolve the custom package manager before removing legacy configuration.')
        )
    for name in ('package-lock.json', 'yarn.lock'):
        if (root / name).exists():
            plan.notices.append(
                f'{name} is preserved. Frontend preparation creates a new pnpm resolution; review and commit it, then remove the obsolete lockfile.'
            )
    if (
        not old_directory.is_relative_to(root)
        or old_directory == root
        or any(path.is_symlink() for path in [source_directory, *source_directory.parents] if path != root)
        or target_directory.is_symlink()
    ):
        raise MigrationReadError(
            MigrationIssue(
                legacy_path,
                1,
                'Move local_entry inside the app into an app-owned directory under js/ and update its imports.',
            )
        )
    if move and (old_directory.is_relative_to(target_directory) or target_directory.is_relative_to(old_directory)):
        raise MigrationReadError(
            MigrationIssue(legacy_path, 1, 'Overlapping local_entry and js/ trees must be merged manually.')
        )
    javascript = JavaScriptSources(plan, old_directory, target_directory, sources.requests)
    if move:
        moved = plan.source_tree(old_directory)
        if any(path.suffix == '.py' for path in moved):
            raise MigrationReadError(
                MigrationIssue(
                    old_directory, 1, 'Separate Python modules from the JavaScript source tree before moving it.'
                )
            )
        javascript.check_relocation(moved)
        javascript.check_external_references(path for path in files if path != legacy_path)
        for path in files:
            if (
                not path.is_relative_to(old_directory)
                and path != legacy_path
                and (path.suffix in ('.py', '.sh', '.fish') or path.name in ('Makefile', 'Dockerfile'))
                and fields.local_entry in (plan.read(path) or '')
            ):
                plan.issues.append(
                    MigrationIssue(
                        path,
                        1,
                        f'Rewrite the reference to {fields.local_entry} before moving the local source tree to js/.',
                    )
                )
        for path in moved:
            transformed = None
            if path.suffix in ('.sh', '.fish') or path.name in ('Makefile', 'Dockerfile'):
                transformed = _command(plan.read(path) or '', path, plan)
            plan.copy(path, target_directory / path.relative_to(old_directory), transformed)
            plan.write(path, None)
    javascript.prepare_entry()
    resolved = {request: source for request in sources.requests if (source := javascript.resolve(request)) is not None}
    apply_sources(sources, resolved, plan)
    _configuration(plan, sources)
    vite_path = root / 'vite.config.ts'
    vite_text = plan.read(vite_path)
    if vite_text is not None and '@darajs/vite-plugin' not in vite_text:
        plan.issues.append(
            MigrationIssue(
                vite_path,
                1,
                'Add the Dara Vite plugin to this customized configuration; move library builds to vite.lib.config.ts with a separate output.',
            )
        )
    if move and plan.issues:
        return
    if plan.read(legacy_path) is not None and not plan.issues:
        plan.write(legacy_path, None)
    plan.finish()


def plan_migration(root: Path, *, analyze_javascript: bool = True) -> MigrationPlan:
    """Inspect legacy files statically and propose only transformations with resolved sources."""
    plan = MigrationPlan(root.resolve())
    try:
        _plan(plan, analyze_javascript)
    except MigrationReadError as error:
        plan.issues.append(error.issue)
    except (OSError, RuntimeError) as error:
        plan.issues.append(MigrationIssue(plan.root, 1, f'Cannot inspect migration inputs: {error}'))
    return plan


def migrate_before_prepare(root: Path, *, frozen: bool = False) -> list[Path]:
    """Apply a complete supported migration before importing the app; unresolved plans write nothing."""
    plan = plan_migration(root, analyze_javascript=not frozen)
    if plan.issues:
        guidance = '\n'.join(f'{issue.path}:{issue.line}: {issue.message}' for issue in plan.issues)
        raise ProjectError(
            'migration.manual', guidance, 'make the listed manual edits, then rerun dara lock or dara dev'
        )
    if frozen and plan.changes:
        raise ProjectError(
            'migration.required',
            'Frozen development cannot apply legacy source changes',
            'run dara lock and review the migration before retrying --frozen',
        )
    if not plan.changes:
        return []
    click.echo('Legacy Dara configuration detected; applying automatic migration.', err=True)
    written = plan.apply()
    if plan.issues:
        guidance = '\n'.join(f'{issue.path}:{issue.line}: {issue.message}' for issue in plan.issues)
        raise ProjectError('migration.changed', guidance, 'review the reported files and rerun the command')
    click.echo(f'Migrated {len(written)} files; review git diff and commit the changes.', err=True)
    for notice in dict.fromkeys(plan.notices):
        click.echo(f'Migration note: {notice}', err=True)
    return written
