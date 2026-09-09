"""Convert understood legacy project settings after the app loads with Dara 2.0 declarations."""

import json
import os
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import ConfigDict, Field

import click
from dara.core.js_tooling.models import ProjectError
from dara.core.js_tooling.project_files import PackageFields, ProjectFields
from dara.core.js_tooling.source import MIGRATION_SKILL


class _LegacyConfig(ProjectFields):
    model_config = ConfigDict(strict=True, extra='forbid')

    local_entry: Literal['js', './js', 'js/', './js/'] = './js'
    package_manager: Literal['pnpm', 'npm', 'yarn'] = 'pnpm'
    extra_dependencies: dict[str, str] = Field(default_factory=dict)


class _Package(PackageFields):
    peerDependencies: dict[str, str] = Field(default_factory=dict)


@dataclass(frozen=True)
class _Snapshot:
    content: bytes | None
    mode: int | None

    def document(self, path: Path) -> dict:
        """Parse a JSON object while retaining the exact bytes for the write preflight."""
        try:
            value = json.loads(self.content) if self.content is not None else {}
            if not isinstance(value, dict):
                raise ValueError('expected an object')
            return value
        except ValueError as error:
            raise ProjectError('migration.config', f'{path}: {error}', f'edit {path}') from error


def _read(path: Path) -> _Snapshot:
    if path.is_symlink():
        raise ProjectError('migration.config', f'{path}: migration requires an app-owned file', MIGRATION_SKILL)
    try:
        return _Snapshot(path.read_bytes(), stat.S_IMODE(path.stat().st_mode))
    except FileNotFoundError:
        return _Snapshot(None, None)
    except OSError as error:
        raise ProjectError('migration.config', f'{path}: {error}', f'edit {path}') from error


def _unchanged(path: Path, before: _Snapshot) -> None:
    if _read(path) != before:
        raise ProjectError(
            'migration.changed', f'{path} changed during migration', 'review the file and rerun dara lock'
        )


def _replace(path: Path, text: str, mode: int | None) -> None:
    fd, temporary = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(text)
        if mode is not None:
            Path(temporary).chmod(mode)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def migrate_legacy_config(root: Path, *, frozen: bool = False) -> list[Path]:
    """Copy legacy dependencies and remove understood configuration under the preparation lock.

    The caller has already loaded the application's current declarations. Source files, imports,
    scripts and directory layouts belong to the migration skill, not automatic preparation.
    """
    root = root.resolve()
    legacy_path, package_path = root / 'dara.config.json', root / 'package.json'
    legacy_before = _read(legacy_path)
    if legacy_before.content is None:
        return []
    if frozen:
        raise ProjectError('migration.required', 'Legacy project configuration requires migration', 'run dara lock')
    try:
        legacy = _LegacyConfig.parse(legacy_before.document(legacy_path), legacy_path)
    except ProjectError as error:
        raise ProjectError('migration.manual', str(error), MIGRATION_SKILL) from error
    package_before = _read(package_path)
    package = package_before.document(package_path)
    fields = _Package.parse(package, package_path)
    sections = [*fields.dependency_sections.values(), fields.peerDependencies]
    additions = {}
    for name, requirement in legacy.extra_dependencies.items():
        existing = [section[name] for section in sections if name in section]
        if any(value != requirement for value in existing):
            raise ProjectError(
                'migration.conflict',
                f'{name}: package.json has {", ".join(existing)}, dara.config.json has {requirement}',
                f'reconcile the two requirements, then rerun dara lock; {MIGRATION_SKILL}',
            )
        if not existing:
            additions[name] = requirement
    if additions:
        if package_before.content is None:
            package.update(name=root.name.replace('_', '-').lower(), private=True, type='module')
        package['dependencies'] = {**fields.dependencies, **additions}
    _unchanged(legacy_path, legacy_before)
    _unchanged(package_path, package_before)
    click.echo('Legacy Dara configuration detected; migrating project settings.', err=True)
    changed = []
    try:
        if additions:
            _unchanged(package_path, package_before)
            _replace(package_path, json.dumps(package, indent=2) + '\n', package_before.mode)
            changed.append(package_path)
        # Keep the original configuration until its dependencies have been copied successfully.
        _unchanged(legacy_path, legacy_before)
        legacy_path.unlink()
        changed.append(legacy_path)
    except OSError as error:
        raise ProjectError('migration.write', str(error), 'review git diff and rerun dara lock') from error
    click.echo('Migrated legacy configuration; review git diff and commit the changes.', err=True)
    for name in ('package-lock.json', 'yarn.lock'):
        if (root / name).exists():
            click.echo(f'Migration note: {name} is preserved. Review pnpm-lock.yaml before removing it.', err=True)
    return changed
