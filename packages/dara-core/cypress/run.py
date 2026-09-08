"""Build the isolated Cypress application and run the browser suite against its artifact."""

import os
import shlex
import subprocess
import sys
from pathlib import Path

from dara.core.internal.port_utils import find_available_port

root = Path(__file__).resolve().parents[1]
app = root / 'cypress/app'
port = find_available_port('127.0.0.1', 8140, 8240)
base_url = f'http://127.0.0.1:{port}'
env = {
    **os.environ,
    'PYTHONPATH': os.pathsep.join([str(root), os.environ.get('PYTHONPATH', '')]),
    'CYPRESS_BASE_URL': base_url,
    'DARA_POOL_MAX_WORKERS': '2',
    'JWT_SECRET': 'cypress-test-secret',
}
cli = [sys.executable, '-c', 'from dara.core.cli import cli; cli()']
subprocess.run([*cli, 'build'], cwd=app, env=env, check=True)
subprocess.run(
    [
        'pnpm',
        'exec',
        'start-server-and-test',
        f'cd {shlex.quote(str(app))} && '
        + shlex.join([*cli, 'start', '--host', '127.0.0.1', '--port', str(port), '--disable-metrics']),
        f'http-get://127.0.0.1:{port}/status',
        'cypress run --e2e',
    ],
    cwd=root,
    env=env,
    check=True,
)
