"""Keep release checks strict when subprocesses or deployed artifacts are broken."""

import importlib.util
import os
import sys
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[4]
SPEC = importlib.util.spec_from_file_location(
    'frontend_release_check', REPO / 'tooling/scripts/check_frontend_release.py'
)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


@pytest.mark.skipif(os.name != 'posix', reason='POSIX descendant signal regression')
def test_release_server_stops_descendants_after_a_failed_scenario(tmp_path):
    server = tmp_path / 'server.py'
    server.write_text(
        '''import http.server, subprocess, sys
from pathlib import Path
child = subprocess.Popen([sys.executable, '-c', """import signal, time
from pathlib import Path
signal.signal(signal.SIGTERM, signal.SIG_IGN)
while True:
 Path('heartbeat').write_text(str(time.monotonic_ns()))
 time.sleep(0.02)
"""])
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if not Path('heartbeat').exists():
   self.send_response(503)
  else:
   self.send_response(200)
  self.end_headers()
  self.wfile.write(b'{}')
http.server.HTTPServer(('127.0.0.1', int(sys.argv[sys.argv.index('--port') + 1])), Handler).serve_forever()
'''
    )
    check = release.ReleaseCheck(tmp_path, False)
    check.cli = [sys.executable, str(server)]
    try:
        with pytest.raises(RuntimeError, match='scenario failed'), check.server(tmp_path):
            raise RuntimeError('scenario failed')
        heartbeat = (tmp_path / 'heartbeat').read_text()
        time.sleep(0.1)
        assert (tmp_path / 'heartbeat').read_text() == heartbeat
    finally:
        check.processes.close()


@pytest.mark.parametrize('operation', ['check', 'build'])
def test_release_build_rejects_dependency_repairs_by_frozen_commands(tmp_path, operation):
    cli = tmp_path / 'cli.py'
    cli.write_text(
        f"""import sys
from pathlib import Path
if sys.argv[1] == 'lock':
 Path('package.json').write_text('{{}}')
if sys.argv[1] == {operation!r}:
 Path('package.json').write_text('{{"repaired":true}}')
"""
    )
    check = release.ReleaseCheck(tmp_path, False)
    check.cli = [sys.executable, str(cli)]
    try:
        with pytest.raises(AssertionError, match=f'dara {operation} changed dependency documents'):
            check.build(tmp_path)
    finally:
        check.processes.close()


@pytest.mark.parametrize(
    ('filename', 'content'),
    [('assets/app.js', release.PRIVATE_SENTINEL), ('.npmrc', '//registry.example/:_authToken=anything')],
)
def test_release_output_rejects_credentials_and_registry_configuration(tmp_path, filename, content):
    (tmp_path / '.dara-build.json').write_text('{}')
    release.assert_clean_output(tmp_path)
    file = tmp_path / filename
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content)
    with pytest.raises(AssertionError, match='in output'):
        release.assert_clean_output(tmp_path)
