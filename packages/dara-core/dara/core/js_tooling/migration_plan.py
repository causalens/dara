"""Reviewable migration edits with exact snapshots and contained atomic writes."""

import os
import stat
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class MigrationIssue:
    """An unresolved source location and the concrete edit needed there."""

    path: Path
    line: int
    message: str


class MigrationReadError(Exception):
    """Stop planning when an input cannot be read or a destination is unsafe."""

    def __init__(self, issue: MigrationIssue):
        self.issue = issue
        super().__init__(issue.message)


@dataclass(frozen=True)
class SourceRequest:
    """A proven Python declaration whose JavaScript implementation needs resolution."""

    path: Path
    line: int
    class_name: str
    module: str | None
    export_name: str


@dataclass(frozen=True)
class Change:
    """One compare-before-write replacement, creation or removal."""

    path: Path
    before: str | None
    after: str | None


@dataclass(frozen=True)
class _Snapshot:
    text: str | None
    mode: int | None
    resolved: Path


def _snapshot(path: Path) -> _Snapshot:
    resolved = path.resolve()
    try:
        status = path.stat()
    except FileNotFoundError:
        return _Snapshot(None, None, resolved)
    # Decode explicitly: Path.read_text's universal-newline conversion would silently
    # rewrite every CRLF line in a file with only one migrated declaration.
    text = path.read_bytes().decode('utf-8')
    return _Snapshot(text, stat.S_IMODE(status.st_mode), resolved)


def _inventory(root: Path) -> tuple[str, ...]:
    def failed(error: OSError) -> None:
        raise error

    if not root.exists():
        return ()
    if root.is_symlink() or not root.is_dir():
        raise ValueError('The source tree must be a regular directory; move it manually.')
    entries: list[str] = []
    excluded = {'.git', '.venv', 'node_modules', 'dist', '__pycache__', '.dara'}
    for directory, children, files in os.walk(root, followlinks=False, onerror=failed):
        for name in sorted([*children, *files]):
            path = Path(directory) / name
            if path.is_symlink():
                raise ValueError(f'Move linked source {path.relative_to(root)} manually before migration.')
            if name in excluded:
                raise ValueError(
                    f'Remove generated or dependency path {path.relative_to(root)} from the source tree before moving it.'
                )
            if not path.is_dir() and not path.is_file():
                raise ValueError(f'Move unsupported source {path.relative_to(root)} manually before migration.')
            entries.append(path.relative_to(root).as_posix() + ('/' if path.is_dir() else ''))
        children.sort()
    return tuple(sorted(entries))


def _replace(path: Path, content: str, mode: int | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content.encode('utf-8'))
        if mode is not None:
            Path(temporary).chmod(mode)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


@dataclass
class MigrationPlan:
    """Keep planning separate from writes and preserve recoverable partial progress."""

    root: Path
    changes: list[Change] = field(default_factory=list)
    issues: list[MigrationIssue] = field(default_factory=list)
    notices: list[str] = field(default_factory=list)
    _snapshots: dict[Path, _Snapshot] = field(default_factory=dict, repr=False)
    _proposed: dict[Path, str | None] = field(default_factory=dict, repr=False)
    _modes: dict[Path, int] = field(default_factory=dict, repr=False)
    _trees: dict[Path, tuple[str, ...]] = field(default_factory=dict, repr=False)
    _directories: dict[Path, tuple[str, ...] | None] = field(default_factory=dict, repr=False)

    def observe_directory(self, path: Path, entries: list[str] | None) -> None:
        """Adopt resolver search directories so new candidates invalidate an analyzed plan."""
        expected = tuple(entries) if entries is not None else None
        actual = tuple(sorted(os.listdir(path))) if path.exists() else None
        if (
            not path.is_absolute()
            or actual != expected
            or (path in self._directories and self._directories[path] != expected)
        ):
            raise MigrationReadError(
                MigrationIssue(path, 1, 'Directory changed during migration analysis; rerun the command.')
            )
        self._directories[path] = expected

    def read(self, path: Path) -> str | None:
        """Read an exact UTF-8 snapshot once, including read-only package metadata."""
        if path not in self._snapshots:
            try:
                self._snapshots[path] = _snapshot(path)
            except (OSError, ValueError, RuntimeError) as error:
                raise MigrationReadError(
                    MigrationIssue(
                        path, 1, f'Cannot read this migration input: {error}. Resolve it and rerun dara lock.'
                    )
                ) from error
        return self._snapshots[path].text

    def _destination(self, path: Path) -> None:
        if not path.is_relative_to(self.root) or not path.resolve().is_relative_to(self.root):
            raise ValueError('Migration destinations must remain inside the application root.')
        for ancestor in [path, *path.parents]:
            if ancestor == self.root:
                break
            if ancestor.is_symlink():
                raise ValueError('Replace linked migration destinations with app-owned files/directories first.')

    def write(self, path: Path, text: str | None) -> None:
        """Propose a contained edit after recording its previous contents."""
        try:
            self._destination(path)
        except (OSError, ValueError, RuntimeError) as error:
            raise MigrationReadError(MigrationIssue(path, 1, str(error))) from error
        self.read(path)
        self._proposed[path] = text

    def source_tree(self, root: Path) -> list[Path]:
        """Snapshot every movable file, including hidden source directories."""
        try:
            self._destination(root)
            inventory = _inventory(root)
        except (OSError, ValueError, RuntimeError) as error:
            raise MigrationReadError(MigrationIssue(root, 1, str(error))) from error
        self._trees[root] = inventory
        return [root / entry for entry in inventory if not entry.endswith('/')]

    def copy(self, source: Path, destination: Path, transformed: str | None = None) -> None:
        """Propose a source-tree copy, optionally migrated, preserving executable permissions."""
        original = self.read(source)
        if original is None:
            raise MigrationReadError(MigrationIssue(source, 1, 'Source disappeared; rerun dara lock.'))
        text = original if transformed is None else transformed
        existing = self.read(destination)
        source_mode = self._snapshots[source].mode
        if existing is not None and (existing != text or self._snapshots[destination].mode != source_mode):
            raise MigrationReadError(
                MigrationIssue(
                    destination,
                    1,
                    'The destination has different contents or permissions; merge the source trees manually.',
                )
            )
        self.write(destination, text)
        if source_mode is not None:
            self._modes[destination] = source_mode

    def finish(self) -> None:
        """Order new destinations before references, and legacy removal last."""
        self.changes = [
            Change(path, self._snapshots[path].text, after)
            for path, after in self._proposed.items()
            if self._snapshots[path].text != after
        ]
        self.changes.sort(
            key=lambda change: (
                change.after is None,
                change.before is not None,
                change.path.name == 'dara.config.json',
                str(change.path),
            )
        )

    def apply(self) -> list[Path]:
        """Preflight all inputs, then apply atomic file edits with source-linked failures."""
        written: list[Path] = []
        path = self.root
        try:
            # Check the complete read set before writing even the first new file.
            for path, before in self._snapshots.items():
                if _snapshot(path) != before:
                    raise ValueError('File changed during migration; rerun dara lock.')
            for path, inventory in self._trees.items():
                if _inventory(path) != inventory:
                    raise ValueError('Source tree changed during migration; rerun dara lock.')
            for path, entries in self._directories.items():
                if (tuple(sorted(os.listdir(path))) if path.exists() else None) != entries:
                    raise ValueError('Resolver directory changed during migration; rerun dara lock.')
            for change in self.changes:
                path = change.path
                self._destination(path)
                before = self._snapshots[path]
                if _snapshot(path) != before:
                    raise ValueError('File changed during migration; rerun dara lock.')
                if change.after is None:
                    path.unlink()
                else:
                    _replace(path, change.after, self._modes.get(path, before.mode))
                written.append(path)
        except (OSError, ValueError, RuntimeError) as error:
            self.issues.append(
                MigrationIssue(
                    path, 1, f'{error} Successfully updated {len(written)} files; review and rerun dara lock.'
                )
            )
        return written
