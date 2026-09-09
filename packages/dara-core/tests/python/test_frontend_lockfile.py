"""PnPM verifies effective declarations without normalizing the user's project."""

import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest

from dara.core.js_tooling import lockfile
from dara.core.js_tooling.models import ProjectError
from dara.core.js_tooling.workspace import read_workspace


@pytest.fixture
def snapshot(tmp_path):
    (tmp_path / 'package.json').write_text('{"name":"app","dependencies":{"widgets":"file:./vendor/widgets.tgz"}}')
    (tmp_path / 'pnpm-workspace.yaml').write_text('# policy\npackageExtensions: {}\noverrides: {}\n')
    (tmp_path / 'pnpm-lock.yaml').write_text('# preserve this comment\n\nlockfileVersion: "9.0"\nimporters: {.: {}}\n')
    vendor = tmp_path / 'vendor'
    vendor.mkdir()
    (vendor / 'widgets.tgz').write_bytes(b'archive-input')
    (tmp_path / '.pnpmfile.cjs').write_text('module.exports = require("./hooks.cjs");\n')
    (tmp_path / 'hooks.cjs').write_text('module.exports = {};\n')
    installed = tmp_path / 'node_modules'
    installed.mkdir()
    (installed / 'sentinel').write_text('untouched')
    return read_workspace(tmp_path)


def test_native_verification_can_rewrite_only_the_disposable_metadata(snapshot):
    root = snapshot.root
    before = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in root.rglob('*') if path.is_file()}
    mirror_path = None

    def verify(command, **options):
        nonlocal mirror_path
        mirror = mirror_path = options['cwd']
        assert mirror != root
        assert '--frozen-lockfile' in command and '--lockfile-only' in command
        assert '--ignore-scripts' in command and '--offline' in command and '--frozen-store' in command
        assert command[-2:] == ['--lockfile-dir', str(mirror)]
        assert not (mirror / 'node_modules').exists()
        assert (mirror / 'vendor/widgets.tgz').read_bytes() == b'archive-input'
        assert (mirror / '.pnpmfile.cjs').read_text() == (root / '.pnpmfile.cjs').read_text()
        assert (mirror / 'hooks.cjs').read_text() == (root / 'hooks.cjs').read_text()
        for name in ('package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'):
            assert not (mirror / name).is_symlink()
            (mirror / name).write_text('normalized by pnpm')
        return subprocess.CompletedProcess(command, 0, stdout='', stderr='')

    owner = Mock()
    owner.run.side_effect = verify
    assert lockfile.verify_lockfile(snapshot, processes=owner)
    owner.run.assert_called_once()
    assert mirror_path is not None and not mirror_path.exists()
    assert all((path.read_bytes(), path.stat().st_mtime_ns) == original for path, original in before.items())


@pytest.mark.parametrize(
    'code',
    [
        'ERR_PNPM_OUTDATED_LOCKFILE',
        'ERR_PNPM_LOCKFILE_CONFIG_MISMATCH',
        'ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER',
    ],
)
def test_only_native_drift_codes_authorize_resolution_updates(snapshot, code):
    owner = Mock()
    owner.run.return_value = subprocess.CompletedProcess([], 1, stdout='', stderr=f'Error: {code}\n')
    assert lockfile.verify_lockfile(snapshot, processes=owner) is False


@pytest.mark.parametrize(
    'failure',
    [
        'ERR_PNPM_BROKEN_LOCKFILE',
        'ERR_PNPM_UNSUPPORTED_ENGINE',
        'ERR_PNPM_NO_OFFLINE_META',
        'Supply-chain policy refused a locked package',
    ],
)
def test_other_verification_failures_keep_the_original_diagnostic(snapshot, failure):
    owner = Mock()
    owner.run.return_value = subprocess.CompletedProcess([], 1, stdout='', stderr=failure)
    with pytest.raises(ProjectError) as error:
        lockfile.verify_lockfile(snapshot, processes=owner)
    assert error.value.diagnostic.code == 'dependency.lockfile'
    assert failure in str(error.value)
