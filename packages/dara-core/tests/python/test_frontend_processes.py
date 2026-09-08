"""Development shutdown owns installation and frontend process trees alike."""

import contextlib
import json
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
from filelock import FileLock

from dara.core.js_tooling.processes import ProcessCancelled, ProcessOwner


def _wait_for(path: Path) -> None:
    deadline = time.monotonic() + 15
    while not path.exists() and time.monotonic() < deadline:
        time.sleep(0.05)
    assert path.exists(), f'Timed out waiting for {path.name}'


def _running(pid: int) -> bool:
    # An adopted zombie has exited and cannot mutate files or hold a listening port.
    status = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], capture_output=True, text=True, check=False)
    return bool(status.stdout.strip()) and not status.stdout.strip().startswith('Z')


@pytest.mark.skipif(os.name != 'posix', reason='Exercise POSIX signals and process groups')
@pytest.mark.parametrize(
    'phase, interruption', [('install', signal.SIGTERM), ('install', signal.SIGINT), ('serve', signal.SIGTERM)]
)
def test_supervisor_shutdown_cleans_preparation_and_frontend_trees(tmp_path, phase, interruption):
    binaries = tmp_path / 'bin'
    binaries.mkdir()
    pnpm = binaries / 'pnpm'
    pnpm.write_text(
        f'#!{sys.executable}\n'
        + """import json, os, signal, subprocess, sys, time
from pathlib import Path
args = sys.argv[1:]
if args[:2] == ['config', 'get']:
    print('undefined')
elif 'init' in args:
    Path('vite.config.ts').write_text('export default {}')
    Path('tsconfig.json').write_text('{}')
    print('{}')
elif os.environ['VITE_TEST_BLOCK_PHASE'] in args:
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])
    Path('active-processes.json').write_text(json.dumps([os.getpid(), child.pid]))
    time.sleep(120)
"""
    )
    pnpm.chmod(0o755)
    script = """from pathlib import Path
from dara.core.js_tooling import supervisor, project
from dara.core.js_tooling.models import FrontendManifest
root = Path.cwd()
manifest = FrontendManifest(configuration='app:config', dara_version='2.0.0', package_requirements=[], module_dependencies=[], components=[], actions=[], out_dir=str(root / 'dist'))
supervisor.load_configuration = lambda reference: None
supervisor.derive_manifest = lambda *args: manifest
project.check_toolchain = lambda **kwargs: {}
supervisor.supervise(root, 'app:config', {}, frontend_only=True)
"""
    environment = {
        **os.environ,
        'PATH': str(binaries) + os.pathsep + os.environ['PATH'],
        'VITE_TEST_BLOCK_PHASE': phase,
    }
    if phase == 'serve':
        (tmp_path / 'package.json').write_text('{"devDependencies": []}')
    process_ids = []
    with (tmp_path / 'supervisor.log').open('w+') as log:
        supervisor = subprocess.Popen(
            [sys.executable, '-c', script],
            cwd=tmp_path,
            env=environment,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
        try:
            if phase == 'serve':
                # A malformed project edit must remain recoverable in the same supervisor.
                status = tmp_path / 'node_modules/.dara/dev-server.json'
                _wait_for(status)
                assert json.loads(status.read_text())['state'] == 'blocked'
                (tmp_path / 'package.json').write_text('{}')
            _wait_for(tmp_path / 'active-processes.json')
            process_ids = json.loads((tmp_path / 'active-processes.json').read_text())
            supervisor.send_signal(interruption)
            assert supervisor.wait(timeout=12) == 0
            assert all(not _running(pid) for pid in process_ids)
            assert not (tmp_path / 'node_modules/.dara/supervisor.json').exists()
            assert not (tmp_path / 'node_modules/.dara/dev-server.json').exists()
        finally:
            if supervisor.poll() is None:
                os.killpg(supervisor.pid, signal.SIGKILL)
            supervisor.wait()
            if process_ids:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process_ids[0], signal.SIGKILL)


@pytest.mark.skipif(os.name != 'posix', reason='Exercise POSIX descendant cleanup after launcher exit')
def test_owner_stops_descendants_after_launcher_has_exited(tmp_path):
    owner = ProcessOwner()
    marker = tmp_path / 'child.pid'
    script = """import subprocess, sys
from pathlib import Path
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])
Path(sys.argv[1]).write_text(str(child.pid))
"""
    launcher = owner.start([sys.executable, '-c', script, str(marker)])
    try:
        _wait_for(marker)
        assert launcher.wait(timeout=5) == 0
        descendant = int(marker.read_text())
        assert _running(descendant)
        owner.close()
        deadline = time.monotonic() + 2
        while _running(descendant) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not _running(descendant)
        with pytest.raises(ProcessCancelled):
            owner.start([sys.executable, '-c', 'pass'])
    finally:
        owner.close()


def test_waiting_for_preparation_lock_is_cancellable(tmp_path):
    owner = ProcessOwner()
    entered = threading.Event()
    cancelled = threading.Event()

    def wait_for_lock():
        entered.set()
        try:
            with owner.lock(tmp_path / 'prepare.lock'):
                pytest.fail('Acquired a lock owned by another preparation')
        except ProcessCancelled:
            cancelled.set()

    with FileLock(tmp_path / 'prepare.lock'):
        worker = threading.Thread(target=wait_for_lock)
        worker.start()
        assert entered.wait(timeout=2)
        owner.close()
        worker.join(timeout=2)
        assert not worker.is_alive()
        assert cancelled.is_set()
