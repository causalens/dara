"""Development process ownership: Python reload, frontend preparation, Vite and shutdown."""

import json
import os
import signal
import subprocess
import sys
import threading
import uuid
import webbrowser
from pathlib import Path

import uvicorn
from filelock import FileLock

import click
from dara.core.js_tooling.models import FrontendManifest, ProjectError
from dara.core.js_tooling.project import (
    atomic_write,
    dependency_fingerprint,
    derive_manifest,
    load_configuration,
    prepare_project,
    read_json,
    runner_environment,
    write_manifest,
)
from dara.core.js_tooling.runtime import frontend_status


def _stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    try:
        if os.name == 'posix':
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == 'posix':
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait()
    except ProcessLookupError:
        pass


def supervise(
    root: Path,
    reference: str,
    serving: dict,
    *,
    frozen: bool = False,
    no_typecheck: bool = False,
    no_reload: bool = False,
    frontend_only: bool = False,
    backend_only: bool = False,
    open_browser: bool = False,
    reload_dirs: tuple[str, ...] = (),
) -> None:
    """Own every child and serialize frontend preparation independently of backend reloads."""
    if frontend_only and backend_only:
        raise ProjectError('command.flags', '--frontend-only and --backend-only cannot be combined', 'dara dev')
    private = root / 'node_modules/.dara'
    private.mkdir(parents=True, exist_ok=True)
    manifest_path = private / 'manifest.dev.json'
    status_path = private / 'dev-server.json'
    owner_path = private / 'supervisor.json'
    ready_path = private / 'backend-ready.json'
    stop = threading.Event()
    children: dict[str, subprocess.Popen | None] = {'backend': None, 'frontend': None}
    token = str(uuid.uuid4())
    seed: FrontendManifest | None = None
    if frontend_only:
        seed = derive_manifest(load_configuration(reference), root, reference)
    if not backend_only:
        # Another live frontend supervisor must not be silently displaced.
        with FileLock(private / 'supervisor.lock'):
            if owner_path.exists():
                try:
                    previous = read_json(owner_path)
                    os.kill(previous['pid'], 0)
                except (OSError, KeyError, ProjectError):
                    pass
                else:
                    raise ProjectError(
                        'frontend.owner',
                        f'Frontend already owned by process {previous["pid"]}',
                        'stop the existing dara dev process',
                    )
            status_path.unlink(missing_ok=True)
            atomic_write(owner_path, json.dumps({'pid': os.getpid(), 'token': token}))
            if seed is not None:
                write_manifest(root, seed, 'dev')
            else:
                manifest_path.unlink(missing_ok=True)
                ready_path.unlink(missing_ok=True)

    def blocked(error: ProjectError) -> None:
        atomic_write(
            status_path, json.dumps({'state': 'blocked', 'token': token, 'diagnostic': error.diagnostic.model_dump()})
        )
        click.echo(f'{error.diagnostic.code}: {error}. {error.diagnostic.fix}', err=True)

    def frontend_loop() -> None:
        attempted = None
        opened = False
        exited = False
        while not stop.wait(0.2):
            try:
                current = FrontendManifest.model_validate(read_json(manifest_path)) if manifest_path.exists() else seed
                if current is None:
                    continue
                config_contents = [
                    (root / name).read_text() if (root / name).exists() else None
                    for name in ('vite.config.ts', 'tsconfig.json')
                ]
                signature = (
                    json.dumps([r.model_dump() for r in current.package_requirements]),
                    dependency_fingerprint(root),
                    tuple(config_contents),
                )
                if signature != attempted:
                    attempted = signature
                    # No ready entry is exposed while installation changes its dependency graph.
                    _stop(children['frontend'])
                    children['frontend'] = None
                    status_path.unlink(missing_ok=True)
                    prepare_project(root, current, frozen=frozen)
                    config_contents = [(root / name).read_text() for name in ('vite.config.ts', 'tsconfig.json')]
                    attempted = (signature[0], dependency_fingerprint(root), tuple(config_contents))
                    command = [
                        'pnpm',
                        '--silent',
                        'exec',
                        'dara-vite',
                        'serve',
                        '--root',
                        str(root),
                        '--base-url',
                        os.environ.get('DARA_BASE_URL', ''),
                        '--token',
                        token,
                    ]
                    if no_typecheck:
                        command.append('--no-typecheck')
                    children['frontend'] = subprocess.Popen(
                        command, cwd=root, env=runner_environment(), start_new_session=True, stdout=sys.stderr
                    )
                    exited = False
                process = children['frontend']
                if process and process.poll() is not None and not exited:
                    exited = True
                    blocked(
                        ProjectError(
                            'frontend.exited',
                            f'Frontend process exited {process.returncode}',
                            'fix the reported configuration error and retry dara dev',
                        )
                    )
                if (
                    open_browser
                    and not opened
                    and not frontend_only
                    and ready_path.exists()
                    and frontend_status(root).get('state') == 'ready'
                ):
                    host = serving['host'] if serving['host'] not in ('0.0.0.0', '::') else 'localhost'
                    webbrowser.open(f'http://{host}:{serving["port"]}{serving.get("root_path", "")}')
                    opened = True
            except ProjectError as error:
                blocked(error)
            except (ValueError, OSError) as error:
                blocked(ProjectError('frontend.prepare', str(error), 'dara check'))

    thread = None
    try:
        if not backend_only:
            thread = threading.Thread(target=frontend_loop, name='dara-frontend', daemon=True)
            thread.start()
        if not frontend_only:
            if no_reload:
                # The server remains in this process for IDE debugger breakpoints.
                uvicorn.run('dara.core.main:start', factory=True, **serving)
                return
            command = [
                sys.executable,
                '-m',
                'uvicorn',
                'dara.core.main:start',
                '--factory',
                '--reload',
                '--timeout-graceful-shutdown',
                '5',
                '--host',
                serving['host'],
                '--port',
                str(serving['port']),
                '--root-path',
                serving.get('root_path', ''),
                '--log-config',
                str(serving['log_config']),
            ]
            for directory in reload_dirs or (str(root),):
                command += ['--reload-dir', directory]
            command += ['--reload-exclude', 'node_modules', '--reload-exclude', '.venv']
            children['backend'] = subprocess.Popen(command, cwd=root, start_new_session=True)
        while not stop.wait(0.2):
            if children['backend'] is not None and children['backend'].poll() is not None:
                if children['backend'].returncode:
                    raise ProjectError(
                        'backend.exited', f'Python supervisor exited {children["backend"].returncode}', 'dara dev'
                    )
                break
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        if thread:
            thread.join(timeout=6)
        _stop(children['frontend'])
        _stop(children['backend'])
        if not backend_only:
            status_path.unlink(missing_ok=True)
            owner_path.unlink(missing_ok=True)
