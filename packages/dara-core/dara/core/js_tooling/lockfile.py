"""Ask pnpm to verify effective workspace requirements without rewriting project files."""

import os
import re
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from dara.core.js_tooling.models import ProjectError
from dara.core.js_tooling.processes import ProcessOwner
from dara.core.js_tooling.workspace import WorkspaceSnapshot


def _mirror(workspace: WorkspaceSnapshot, destination: Path) -> None:
    # Recreate only paths containing member metadata. Other inputs remain
    # reachable at their original relative paths, including patches, file:
    # archives and pnpm hook modules. No installed output is linked for writing.
    directories = {
        parent
        for member in workspace.projects
        for parent in [member, *member.parents]
        if parent.is_relative_to(workspace.root)
    }

    def populate(source: Path, target: Path) -> None:
        for entry in source.iterdir():
            output = target / entry.name
            if entry.name == 'node_modules':
                continue
            if entry in directories and entry.is_dir():
                output.mkdir()
                populate(entry, output)
            elif entry.is_file() and (
                entry.name in ('package.json', 'pnpm-workspace.yaml', '.npmrc')
                or (entry.name.startswith('pnpm-lock') and entry.suffix == '.yaml')
            ):
                shutil.copy2(entry, output)
            else:
                output.symlink_to(entry, target_is_directory=entry.is_dir())

    populate(workspace.root, destination)


def verify_lockfile(workspace: WorkspaceSnapshot, *, processes: ProcessOwner | None = None) -> bool:
    """Verify pnpm's effective declarations, preserving every original file and its timestamps."""
    run = processes.run if processes else subprocess.run
    try:
        with TemporaryDirectory(prefix='dara-lock-check-') as temporary:
            mirror = Path(temporary).resolve()
            _mirror(workspace, mirror)
            # pnpm 12's dry-run ignores frozen failures and returns a textual diff.
            # Frozen lockfile-only gives authoritative diagnostics, but can still
            # normalize the lockfile. Keep that write inside this disposable mirror.
            result = run(
                [
                    'pnpm',
                    'install',
                    '--frozen-lockfile',
                    '--lockfile-only',
                    '--ignore-scripts',
                    '--offline',
                    '--frozen-store',
                    '--lockfile-dir',
                    str(mirror),
                ],
                cwd=mirror,
                env={
                    **os.environ,
                    'PNPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS': 'false',
                    'PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN': 'false',
                },
                text=True,
                capture_output=True,
                check=False,
                timeout=300,
            )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ProjectError(
            'dependency.lockfile',
            f'Cannot verify {workspace.root / "pnpm-lock.yaml"}: {error}',
            'check filesystem access and the active pnpm executable',
        ) from error
    if result.returncode == 0:
        return True
    message = result.stderr.strip() or result.stdout.strip()
    codes = set(re.findall(r'\bERR_PNPM_[A-Z_]+\b', message))
    if codes & {
        'ERR_PNPM_OUTDATED_LOCKFILE',
        'ERR_PNPM_LOCKFILE_CONFIG_MISMATCH',
        'ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER',
    }:
        return False
    raise ProjectError(
        'dependency.lockfile',
        f'pnpm could not verify {workspace.root / "pnpm-lock.yaml"}: {message}',
        'resolve the pnpm diagnostic, then rerun dara check',
    )
