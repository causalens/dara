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

import click
from dara.core.js_tooling.models import FrontendManifest, ProjectError
from dara.core.js_tooling.processes import ProcessCancelled, ProcessOwner
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

# Installation and unexpected preparation failures are retried with these delays, then dara dev exits.
RETRY_DELAYS = (2.0, 5.0, 10.0)
RETRIED_CODES = frozenset({'dependency.install', 'frontend.prepare'})


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
    processes = ProcessOwner()
    stop = processes.cancelled
    backend: subprocess.Popen[str] | None = None
    frontend: subprocess.Popen[str] | None = None
    token = str(uuid.uuid4())
    owns_frontend = False
    seed: FrontendManifest | None = None
    fatal: list[ProjectError] = []
    if frontend_only:
        seed = derive_manifest(load_configuration(reference), root, reference)

    def claim_frontend() -> None:
        nonlocal owns_frontend
        # Another live frontend supervisor must not be silently displaced.
        with processes.lock(private / 'supervisor.lock'):
            if owner_path.exists():
                try:
                    previous = read_json(owner_path)
                    os.kill(previous['pid'], 0)
                except (OSError, KeyError, TypeError, ProjectError):
                    pass
                else:
                    raise ProjectError(
                        'frontend.owner',
                        f'Frontend already owned by process {previous["pid"]}',
                        'stop the existing dara dev process',
                    )
            status_path.unlink(missing_ok=True)
            atomic_write(owner_path, json.dumps({'pid': os.getpid(), 'token': token}))
            owns_frontend = True
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
        nonlocal frontend
        attempted = None
        failures = 0
        opened = False
        exited = False

        def retry(error: ProjectError) -> bool:
            """Retry infrastructure failures with backoff; give up by stopping the whole supervisor."""
            nonlocal attempted, failures
            if error.diagnostic.code not in RETRIED_CODES:
                return False
            failures += 1
            blocked(error)
            if failures > len(RETRY_DELAYS):
                fatal.append(error)
                stop.set()
                # Unblock a foreground uvicorn (--no-reload) the same way an operator would.
                signal.raise_signal(signal.SIGTERM)
                return True
            delay = RETRY_DELAYS[failures - 1]
            click.echo(f'Retrying frontend preparation in {delay:g}s ({failures}/{len(RETRY_DELAYS)})', err=True)
            attempted = None
            stop.wait(delay)
            return True

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
                    status_path.unlink(missing_ok=True)
                    processes.stop(frontend)
                    frontend = None
                    prepare_project(root, current, frozen=frozen, processes=processes)
                    failures = 0
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
                    frontend = processes.start(command, cwd=root, env=runner_environment(), stdout=sys.stderr)
                    exited = False
                process = frontend
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
                    # Choose a browser address for wildcard binds; this opens no listener.
                    host = serving['host'] if serving['host'] not in ('0.0.0.0', '::') else 'localhost'  # nosec B104
                    webbrowser.open(f'http://{host}:{serving["port"]}{serving.get("root_path", "")}')
                    opened = True
            except ProcessCancelled:
                return
            except ProjectError as error:
                if not retry(error):
                    blocked(error)
            except (ValueError, OSError) as error:
                wrapped = ProjectError('frontend.prepare', str(error), 'dara check')
                if not retry(wrapped):
                    blocked(wrapped)

    def interrupt(_signum, _frame) -> None:
        # Do not interrupt process creation between spawning and registering a child.
        stop.set()

    previous_signals = {sig: signal.signal(sig, interrupt) for sig in (signal.SIGINT, signal.SIGTERM)}
    thread = None
    try:
        if not backend_only:
            claim_frontend()
            thread = threading.Thread(target=frontend_loop, name='dara-frontend')
            thread.start()
        if not frontend_only:
            if no_reload:
                # The server remains in this process for IDE debugger breakpoints.
                uvicorn.run('dara.core.main:start', factory=True, timeout_graceful_shutdown=5, **serving)
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
            backend = processes.start(command, cwd=root)
        while not stop.wait(0.2):
            if backend is not None and backend.poll() is not None:
                if backend.returncode:
                    raise ProjectError('backend.exited', f'Python supervisor exited {backend.returncode}', 'dara dev')
                break
    except (KeyboardInterrupt, ProcessCancelled):
        pass
    finally:
        processes.close()
        if thread:
            thread.join()
        if owns_frontend:
            status_path.unlink(missing_ok=True)
            owner_path.unlink(missing_ok=True)
        for sig, previous in previous_signals.items():
            signal.signal(sig, previous)
    if fatal:
        raise fatal[0]
