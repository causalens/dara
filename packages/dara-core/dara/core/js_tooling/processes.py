"""Own subprocess trees across frontend preparation, serving and cancellation."""

import contextlib
import os
import signal
import subprocess
import threading
import time
from collections.abc import Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from filelock import FileLock, Timeout


class ProcessCancelled(Exception):
    """The development supervisor stopped while an operation was in progress."""


class ProcessOwner:
    """Close every owned process tree and prevent new children after cancellation."""

    def __init__(self) -> None:
        self.cancelled = threading.Event()
        self._lock = threading.RLock()
        self._processes: set[subprocess.Popen[str]] = set()

    def check_running(self) -> None:
        """Abort a preparation operation when its supervisor has stopped."""
        if self.cancelled.is_set():
            raise ProcessCancelled

    @contextmanager
    def lock(self, path: Path):
        """Acquire an ownership or preparation lock without preventing shutdown."""
        lock = FileLock(path)
        while True:
            self.check_running()
            try:
                lock.acquire(timeout=0.2)
                break
            except Timeout:
                continue
        try:
            yield
        finally:
            lock.release()

    def start(self, command: Sequence[str], **options: Any) -> subprocess.Popen[str]:
        """Start and register a child atomically with respect to shutdown."""
        with self._lock:
            self.check_running()
            if os.name == 'posix':
                options['start_new_session'] = True
            else:
                options['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
            process = subprocess.Popen(command, **{'text': True, **options})
            self._processes.add(process)
            return process

    def run(
        self,
        command: Sequence[str],
        *,
        input: str | None = None,
        capture_output: bool = False,
        check: bool = False,
        timeout: float | None = None,
        **options: Any,
    ) -> subprocess.CompletedProcess[str]:
        """Run a textual command while keeping it cancellable by the supervisor."""
        if input is not None:
            options['stdin'] = subprocess.PIPE
        if capture_output:
            options.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        process = self.start(command, **options)
        try:
            stdout, stderr = process.communicate(input, timeout=timeout)
            self.check_running()
            result = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
            if check:
                result.check_returncode()
            return result
        finally:
            self.stop(process)

    @staticmethod
    def _stop(processes: Sequence[subprocess.Popen[str]]) -> None:
        # Signal every tree before waiting, so shutdown has one grace period.
        for process in processes:
            try:
                if os.name == 'posix':
                    os.killpg(process.pid, signal.SIGTERM)
                else:
                    try:
                        subprocess.run(
                            ['taskkill', '/PID', str(process.pid), '/T', '/F'],
                            capture_output=True,
                            timeout=5,
                            check=False,
                        )
                    except (OSError, subprocess.TimeoutExpired):
                        if process.poll() is None:
                            process.kill()
            except (ProcessLookupError, PermissionError):
                # macOS also reports EPERM for groups containing only orphaned zombies.
                pass
        deadline = time.monotonic() + 5
        for process in processes:
            with contextlib.suppress(subprocess.TimeoutExpired):
                process.wait(timeout=max(0, deadline - time.monotonic()))
        for process in processes:
            try:
                # The launcher may have exited before its descendants. Its process
                # group still belongs to us and must not survive that early exit.
                if os.name == 'posix':
                    os.killpg(process.pid, signal.SIGKILL)
                elif process.poll() is None:
                    process.kill()
            except (ProcessLookupError, PermissionError):
                pass
            process.wait()

    def stop(self, process: subprocess.Popen[str] | None) -> None:
        """Stop a child and its descendants, including after the launcher exits."""
        with self._lock:
            if process is not None and process in self._processes:
                self._stop([process])
                self._processes.remove(process)

    def close(self) -> None:
        """Cancel in-progress work and finish all process trees before returning."""
        self.cancelled.set()
        with self._lock:
            self._stop(list(self._processes))
            self._processes.clear()
