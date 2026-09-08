"""Exercise packed wheels and npm exports in generated, migrated and workspace applications.

Run after `mise run prepare`, using the repository Python environment. Nothing is published.
Use --browser after installing the repository's Cypress binary to exercise rendering and HMR.
"""

import argparse
import contextlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from cookiecutter.main import cookiecutter

REPO = Path(__file__).resolve().parents[2]
TEMPLATE = REPO / 'packages/create-dara-app/create_dara_app/templates/default'
GAUGE = """import {useState} from 'react';
export default function Gauge({label}: {label:string}) {
  const [count,setCount]=useState(0);
  return <section><h1>Source widget: {label}</h1>
    <button onClick={()=>setCount(count+1)}>Count: {count}</button></section>;
}
"""
VITE = "import {defineConfig} from 'vite';\nimport dara from '@darajs/vite-plugin';\nexport default defineConfig(({mode})=>{if(process.env.NODE_ENV!==mode)throw new Error('Wrong config environment');return {plugins:[dara()],server:{watch:{usePolling:true}}};});\n"


def write_json(path: Path, value):
    """Write a reviewable fixture manifest."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


class ReleaseCheck:
    """Own isolated consumers and command logs for one reproducible release check."""

    def __init__(self, root: Path, browser: bool):
        self.root = root
        self.browser = browser
        self.packages = {}
        self.log_number = 0
        self.environment = dict(os.environ)
        self.environment.pop('ELECTRON_RUN_AS_NODE', None)
        self.environment.pop('PYTHONPATH', None)
        self.environment.update(JWT_SECRET='release-fixture-secret-at-least-32-characters', DARA_POOL_MAX_WORKERS='2')
        self.python = root / 'python/bin/python'
        self.cli = [str(self.python), '-c', 'from dara.core.cli import cli; cli()']
        (root / 'logs').mkdir(parents=True, exist_ok=True)

    def run(self, command, cwd: Path, *, environment=None, expected=0):
        """Run a command with a bounded lifetime and retain its complete output."""
        self.log_number += 1
        log = self.root / f'logs/{self.log_number:03d}.log'
        with log.open('w') as output:
            result = subprocess.run(
                [str(argument) for argument in command],
                cwd=cwd,
                env=environment or self.environment,
                stdout=output,
                stderr=subprocess.STDOUT,
                timeout=600,
            )
        if result.returncode != expected:
            raise RuntimeError(f'{command} exited {result.returncode}; see {log}')
        return log.read_text()

    def pack_framework(self):
        """Pack the built npm packages and wheels, then install wheels into a clean environment."""
        vendor = self.root / 'vendor'
        vendor.mkdir()
        for directory in sorted((REPO / 'packages').iterdir()):
            manifest = directory / 'package.json'
            if not manifest.exists():
                continue
            package = json.loads(manifest.read_text())
            if package.get('private') or not package['name'].startswith('@darajs/'):
                continue
            self.run(['pnpm', 'pack', '--pack-destination', vendor], directory)
            tarball = vendor / f'{package["name"].replace("@", "").replace("/", "-")}-{package["version"]}.tgz'
            with tarfile.open(tarball) as archive:
                names = archive.getnames()
                assert not any(name.endswith(('.whl', '.umd.js', '.umd.cjs')) for name in names), tarball
                packed = json.load(archive.extractfile('package/package.json'))
                if package['name'] in ('@darajs/core', '@darajs/components'):
                    assert 'dara-source' not in json.dumps(packed['exports']), tarball
                    for export in packed['exports'].values():
                        for target in export.values():
                            assert 'package/' + target.removeprefix('./') in names, (tarball, target)
            self.packages[package['name']] = tarball
        wheels = self.root / 'wheels'
        wheels.mkdir()
        for package in ('dara-core', 'dara-components'):
            self.run(['uv', 'build', '--package', package, '--wheel', '--out-dir', wheels], REPO)
        for wheel in wheels.glob('*.whl'):
            with zipfile.ZipFile(wheel) as archive:
                assert not any('/auto_js/' in name for name in archive.namelist()), wheel
        self.run([sys.executable, '-m', 'venv', self.root / 'python'], REPO)
        self.run([self.python, '-m', 'pip', 'install', '--disable-pip-version-check', *wheels.glob('*.whl')], self.root)
        self.run(
            [self.python, '-c', "import dara.core; assert 'site-packages' in dara.core.__file__, dara.core.__file__"],
            self.root,
        )

    def vendor(self, root: Path):
        """Keep every local tarball inside the consumer's dependency boundary."""
        (root / 'vendor').mkdir(exist_ok=True)
        for tarball in self.packages.values():
            shutil.copyfile(tarball, root / 'vendor' / tarball.name)
        overrides = {name: f'file:vendor/{tarball.name}' for name, tarball in self.packages.items()}
        workspace = root / 'pnpm-workspace.yaml'
        # JSON flow mappings are valid YAML and preserve scoped names without custom escaping.
        workspace.write_text(
            workspace.read_text() + '\noverrides: ' + json.dumps(overrides) + '\n'
            if workspace.exists()
            else 'overrides: ' + json.dumps(overrides) + '\n'
        )

    def app(self, root: Path, label: str, *, library=False):
        """Create a minimal application using the real library declaration."""
        module = 'widgets' if library else 'app'
        (root / module).mkdir(parents=True, exist_ok=True)
        (root / module / '__init__.py').touch()
        (root / module / 'main.py').write_text(
            'from dara.core import ConfigurationBuilder\nfrom widgets import Gauge\n'
            f'config = ConfigurationBuilder()\nconfig.router.add_page(path="/", content=Gauge(label={label!r}))\n'
        )
        (root / 'js').mkdir(exist_ok=True)
        (root / 'js/index.tsx').write_text('export {};\n')
        (root / 'vite.config.ts').write_text(VITE)
        write_json(root / 'tsconfig.json', {'extends': '@darajs/vite-plugin/tsconfig.json', 'include': ['js']})
        (root / 'pyproject.toml').write_text(f'[tool.dara]\nconfig = "{module}.main:config"\n')
        dependencies = {'@example/widgets': 'workspace:*'} if not library else {}
        write_json(
            root / 'package.json',
            {
                'name': '@example/widgets' if library else f'fixture-{label}',
                'version': '1.0.0',
                'private': not library,
                'type': 'module',
                'devDependencies': dependencies,
            },
        )

    def environment_for(self, app: Path, *, artifact=False):
        """Select the app's Python sources; artifact serving deliberately has no JS toolchain."""
        environment = {**self.environment, 'PYTHONPATH': str(app)}
        if artifact:
            environment['PATH'] = ''
        return environment

    @contextlib.contextmanager
    def server(self, app: Path, *, dev=False, artifact=False):
        """Start one real Dara process, await readiness and always terminate its children."""
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        url = f'http://127.0.0.1:{port}'
        command = [
            *self.cli,
            'dev' if dev else 'start',
            '--host',
            '127.0.0.1',
            '--port',
            str(port),
            '--disable-metrics',
        ]
        if dev:
            command.append('--no-reload')
        log = self.root / 'logs' / f'server-{port}.log'
        with log.open('w') as output:
            process = subprocess.Popen(
                command,
                cwd=app,
                env=self.environment_for(app, artifact=artifact),
                stdout=output,
                stderr=subprocess.STDOUT,
            )
            try:
                deadline = time.monotonic() + 90
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError(f'Server exited; see {log}')
                    try:
                        with urllib.request.urlopen(
                            url + ('/__dara/status' if dev else '/status'), timeout=1
                        ) as response:
                            data = response.read()
                            if not dev or json.loads(data)['state'] == 'ready':
                                break
                    except (urllib.error.URLError, TimeoutError):
                        pass
                    time.sleep(0.2)
                else:
                    raise RuntimeError(f'Server did not become ready; see {log}')
                yield url
            finally:
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

    def browser_check(self, url: str, text: str, *, source: Path | None = None):
        """Check the rendered artifact, and optionally preserve React state through a source edit."""
        with urllib.request.urlopen(url) as response:
            assert b'<html' in response.read().lower()
        if not self.browser:
            return
        spec = self.root / 'release.cy.js'
        steps = f"cy.visit('/login'); cy.contains({json.dumps(text)}, {{timeout:30000}}).should('be.visible');"
        if 'widget:' in text:
            steps += "cy.contains('button', 'Count: 0').click(); cy.contains('button', 'Count: 1');"
        original = source.read_text() if source else None
        if source:
            steps += f'cy.writeFile({json.dumps(str(source))}, {json.dumps(original.replace("Source widget", "Edited widget"))});'
            steps += "cy.contains('Edited widget', {timeout:30000}); cy.contains('button', 'Count: 1');"
        spec.write_text(
            f"describe('release artifact', () => {{ it('renders and interacts', () => {{ {steps} }}); }});\n"
        )
        config = self.root / 'cypress.config.cjs'
        config.write_text(
            'module.exports = '
            + json.dumps(
                {
                    'video': False,
                    'e2e': {'baseUrl': url, 'supportFile': False, 'specPattern': str(spec)},
                }
            )
            + ';\n'
        )
        try:
            self.run(
                [
                    'pnpm',
                    '--dir',
                    REPO / 'packages/dara-core',
                    'exec',
                    'cypress',
                    'run',
                    '--project',
                    self.root,
                    '--config-file',
                    config,
                    '--spec',
                    spec,
                ],
                REPO,
            )
        finally:
            if source:
                source.write_text(original)

    def build(self, app: Path, *, output: str | None = None):
        """Prepare once, then verify frozen checking and production compilation."""
        environment = self.environment_for(app)
        self.run([*self.cli, 'lock'], app, environment=environment)
        self.run([*self.cli, 'check', '--json'], app, environment=environment)
        self.run([*self.cli, 'build', *(['--output', output] if output else [])], app, environment=environment)

    def workspace(self):
        """Exercise two apps, a library's own app, source HMR and actual npm publication."""
        root = self.root / 'workspace'
        root.mkdir()
        write_json(root / 'package.json', {'private': True, 'packageManager': 'pnpm@12.4.0'})
        (root / 'pnpm-workspace.yaml').write_text('packages: ["apps/*", "packages/*"]\nlinkWorkspacePackages: true\n')
        self.vendor(root)
        library = root / 'packages/widgets'
        self.app(library, 'self', library=True)
        (library / 'widgets/__init__.py').write_text(
            'from dara.core import ComponentInstance\nclass Gauge(ComponentInstance):\n'
            "    js_source = '@example/widgets/gauge'\n    label: str\n"
        )
        metadata = library / 'pyproject.toml'
        metadata.write_text(
            metadata.read_text()
            + '\n[build-system]\nrequires=["hatchling"]\nbuild-backend="hatchling.build"\n'
            '[project]\nname="widgets"\nversion="1.0.0"\ndescription="Release fixture"\n'
            '[tool.hatch.build.targets.wheel]\npackages=["widgets"]\n'
        )
        self.run(['uv', 'build', '--wheel', '--out-dir', self.root / 'wheels'], library)
        self.run(
            [
                self.python,
                '-m',
                'pip',
                'install',
                '--no-deps',
                next((self.root / 'wheels').glob('widgets-1.0.0-*.whl')),
            ],
            root,
        )
        (library / 'js/gauge.tsx').write_text(GAUGE)
        (library / 'js/setup.ts').write_text('export {};\n')
        package = json.loads((library / 'package.json').read_text())
        package.update(
            scripts={'build': 'vite build --config vite.lib.config.ts && tsc -p tsconfig.lib.json'},
            peerDependencies={'react': '^18.3.0'},
            files=['dist-lib'],
            exports={
                key: {
                    'dara-source': f'./js/{name}',
                    'types': f'./dist-lib/{name.split(".")[0]}.d.ts',
                    'default': f'./dist-lib/{name.split(".")[0]}.js',
                }
                for key, name in {'./gauge': 'gauge.tsx', './setup': 'setup.ts'}.items()
            },
        )
        package['publishConfig'] = {
            'exports': {
                key: {k: v for k, v in item.items() if k != 'dara-source'} for key, item in package['exports'].items()
            }
        }
        write_json(library / 'package.json', package)
        (library / 'vite.lib.config.ts').write_text(
            "import {defineConfig} from 'vite';\nexport default defineConfig({build:{outDir:'dist-lib',"
            "lib:{entry:{gauge:'js/gauge.tsx',setup:'js/setup.ts'},formats:['es']},"
            'rolldownOptions:{external:(id)=>/^react(?:\\/|$)/.test(id)}}});\n'
        )
        write_json(
            library / 'tsconfig.lib.json',
            {
                'extends': './tsconfig.json',
                'compilerOptions': {
                    'noEmit': False,
                    'declaration': True,
                    'emitDeclarationOnly': True,
                    'outDir': 'dist-lib',
                    'rootDir': 'js',
                },
            },
        )
        self.run([*self.cli, 'lock'], library, environment=self.environment_for(library))
        for name in ('a', 'b'):
            app = root / 'apps' / name
            self.app(app, name)
            self.build(app)
            with self.server(app) as url:
                self.browser_check(url, f'Source widget: {name}')
        with self.server(root / 'apps/a', dev=True) as url:
            self.browser_check(url, 'Source widget: a', source=library / 'js/gauge.tsx')
        self.build(library)
        self.run(['pnpm', 'pack', '--pack-destination', self.root / 'vendor'], library)
        self.packages['@example/widgets'] = self.root / 'vendor/example-widgets-1.0.0.tgz'

    def standalone_apps(self):
        """Build generator output, migrate a legacy app and serve a packed library in a clean consumer."""
        version = json.loads((REPO / 'packages/dara-core/package.json').read_text())['version']
        generated = Path(
            cookiecutter(
                str(TEMPLATE),
                output_dir=str(self.root),
                no_input=True,
                extra_context={
                    'project_name': 'Generated App',
                    '__dara_version': version,
                    '__install': False,
                },
            )
        )
        self.vendor(generated)
        self.build(generated, output='.release-output')
        artifact = self.root / 'artifact-only'
        artifact.mkdir()
        shutil.copytree(generated / 'generated_app', artifact / 'generated_app')
        shutil.copytree(generated / '.release-output', artifact / 'dist')
        (artifact / 'pyproject.toml').write_text('[tool.dara]\nconfig="generated_app.main:config"\n')
        with self.server(artifact, artifact=True) as url:
            self.browser_check(url, 'A framework called Dara has taken the stage')
        migrated = self.root / 'migrated'
        self.app(migrated, 'migrated')
        package = json.loads((migrated / 'package.json').read_text())
        package['devDependencies'] = {}
        write_json(migrated / 'package.json', package)
        (migrated / 'app/main.py').write_text(
            'from dara.core import ConfigurationBuilder, ComponentInstance\nclass Gauge(ComponentInstance):\n'
            '    label: str\nconfig=ConfigurationBuilder()\nconfig.add_component(Gauge, local=True)\n'
            "config.router.add_page(path='/', content=Gauge(label='migrated'))\n"
        )
        (migrated / 'js/gauge.tsx').write_text(GAUGE)
        (migrated / 'js/index.tsx').write_text("export {default as Gauge} from './gauge';\n")
        write_json(
            migrated / 'dara.config.json', {'local_entry': './js', 'extra_dependencies': {}, 'package_manager': 'npm'}
        )
        self.run([*self.cli, 'migrate', '--check'], migrated, expected=1)
        self.run([*self.cli, 'migrate'], migrated)
        self.run([*self.cli, 'migrate'], migrated)
        self.vendor(migrated)
        self.build(migrated)
        with self.server(migrated) as url:
            self.browser_check(url, 'Source widget: migrated')
        packed = self.root / 'packed-consumer'
        self.app(packed, 'packed')
        package = json.loads((packed / 'package.json').read_text())
        package['devDependencies']['@example/widgets'] = 'file:vendor/example-widgets-1.0.0.tgz'
        write_json(packed / 'package.json', package)
        self.vendor(packed)
        self.build(packed)
        with self.server(packed) as url:
            self.browser_check(url, 'Source widget: packed')
        consumer = self.root / 'javascript-only'
        consumer.mkdir()
        self.vendor(consumer)
        write_json(
            consumer / 'package.json',
            {
                'name': 'javascript-only',
                'private': True,
                'type': 'module',
                'dependencies': {
                    '@example/widgets': 'file:vendor/example-widgets-1.0.0.tgz',
                    'react': '18.3.1',
                    'react-dom': '18.3.1',
                },
            },
        )
        (consumer / 'check.mjs').write_text(
            "import assert from 'node:assert/strict';\nimport {existsSync} from 'node:fs';\n"
            "import {createElement} from 'react';\nimport {renderToString} from 'react-dom/server';\n"
            "import Gauge from '@example/widgets/gauge';\n"
            "assert(import.meta.resolve('@example/widgets/gauge').endsWith('/dist-lib/gauge.js'));\n"
            "assert(!existsSync('node_modules/@darajs/core'));\n"
            "assert(renderToString(createElement(Gauge,{label:'plain JS'})).includes('plain JS'));\n"
        )
        self.run(['pnpm', 'install'], consumer)
        self.run(['node', '--conditions=dara-source', 'check.mjs'], consumer)


def main():
    """Run the release matrix without publishing or modifying consumer source checkouts."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--browser', action='store_true')
    args = parser.parse_args()
    root = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix='dara-release-check-'))
    if root.exists() and any(root.iterdir()):
        parser.error('--output must be an empty directory')
    root.mkdir(parents=True, exist_ok=True)
    print(f'Release fixtures and logs: {root}', flush=True)
    check = ReleaseCheck(root, args.browser)
    check.pack_framework()
    check.workspace()
    check.standalone_apps()
    print('Packed wheels, npm exports, workspace apps, migration and artifact-only startup passed.', flush=True)


if __name__ == '__main__':
    main()
