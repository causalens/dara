"""Dara commands describe operations; only development prepares project files automatically."""

import json
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

import uvicorn

import click
from dara.core.internal.port_utils import find_available_port
from dara.core.internal.settings import generate_env_file
from dara.core.js_tooling.models import ProjectError
from dara.core.js_tooling.project import (
    check_toolchain,
    dependency_plan,
    derive_manifest,
    load_configuration,
    lockfile_agrees,
    prepare_project,
    resolve_config,
    run_plugin,
    write_manifest,
)
from dara.core.js_tooling.runtime import validate_build
from dara.core.js_tooling.supervisor import supervise


class DaraGroup(click.Group):
    """Translate shared project errors into command failures with stable repairing guidance."""

    def invoke(self, ctx):
        """Keep domain diagnostics separate from Click's argument parsing."""
        try:
            return super().invoke(ctx)
        except ProjectError as error:
            raise click.ClickException(f'{error.diagnostic.code}: {error}. Fix: {error.diagnostic.fix}') from error


@click.group(cls=DaraGroup)
def cli():
    """Develop, build and serve a Dara application."""


def _resolve_config_path(config: str | None) -> str:
    return resolve_config(Path.cwd(), config)


def _serving_options(function):
    options = [
        click.option('--config', help='Override [tool.dara].config with module:object'),
        click.option('--port', type=click.IntRange(1, 65535)),
        click.option('--host', default='0.0.0.0', show_default=True),
        click.option('--base-url', default=lambda: os.environ.get('DARA_BASE_URL', '')),
        click.option('--metrics-port', type=click.IntRange(1, 65535)),
        click.option('--disable-metrics', is_flag=True),
        click.option('--debug', default=lambda: os.environ.get('DARA_DEBUG_LOG_LEVEL', 'NONE')),
        click.option('--log', default=lambda: os.environ.get('DARA_DEV_LOG_LEVEL', 'NONE')),
    ]
    for option in reversed(options):
        function = option(function)
    return function


def _serving(
    command: str,
    config: str | None,
    host: str,
    port: int | None,
    base_url: str,
    metrics_port: int | None,
    disable_metrics: bool,
    debug: str,
    log: str,
) -> tuple[str, dict]:
    reference = _resolve_config_path(config)
    if base_url and (not base_url.startswith('/') or any(c in base_url for c in ('?', '#', '\\'))):
        raise click.UsageError('--base-url must be an absolute URL path, for example /apps/demo')
    os.environ.update(
        {
            'DARA_COMMAND': command,
            'DARA_CONFIG_PATH': reference,
            'DARA_BASE_URL': base_url.rstrip('/'),
            'DARA_DISABLE_METRICS': 'TRUE' if disable_metrics else 'FALSE',
            'DARA_DEBUG_LOG_LEVEL': debug,
            'DARA_DEV_LOG_LEVEL': log,
        }
    )
    if not disable_metrics:
        os.environ['DARA_METRICS_PORT'] = str(metrics_port or find_available_port(host, 10000, 10100))
    return reference, {
        'host': host,
        'port': port or find_available_port(host, 8000, 8100),
        'root_path': base_url.rstrip('/'),
        'log_config': str(Path(__file__).parent / 'log_configs/logging.yaml'),
    }


@cli.command()
@_serving_options
@click.option('--api-docs', is_flag=True, help='Expose API documentation in deployment posture')
@click.option('--require-sso', is_flag=True, help='Require an SSO authentication configuration')
def start(api_docs: bool, require_sso: bool, **options):
    """Serve an existing build without Node, pnpm, installation or reload."""
    _, serving = _serving('start', **options)
    os.environ['DARA_API_DOCS'] = 'TRUE' if api_docs else 'FALSE'
    os.environ['DARA_ENFORCE_SSO'] = 'TRUE' if require_sso else 'FALSE'
    os.environ['DARA_LIVE_RELOAD'] = 'FALSE'
    uvicorn.run('dara.core.main:start', factory=True, **serving)


@cli.command()
@_serving_options
@click.option('--root', type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option('--frozen', is_flag=True, help='Report checked-in drift without repairing it')
@click.option('--open', 'open_browser', is_flag=True, help='Open the browser once the app is ready')
@click.option('--no-typecheck', is_flag=True, help='Skip the development TypeScript watcher')
@click.option('--no-reload', is_flag=True, help='Run Python in this process for an IDE debugger')
@click.option('--frontend-only', is_flag=True)
@click.option('--backend-only', is_flag=True)
@click.option('--reload-dir', 'reload_dirs', multiple=True, type=click.Path(exists=True, file_okay=False))
def dev(
    root: Path | None,
    frozen: bool,
    open_browser: bool,
    no_typecheck: bool,
    no_reload: bool,
    frontend_only: bool,
    backend_only: bool,
    reload_dirs: tuple[str, ...],
    **options,
):
    """Prepare the frontend and supervise Python, Vite, type checking and reload."""
    if root:
        os.chdir(root)
    root = Path.cwd().resolve()
    reference, serving = _serving('dev', **options)
    os.environ['DARA_LIVE_RELOAD'] = 'FALSE' if no_reload or frontend_only else 'TRUE'
    os.environ['DARA_ENFORCE_SSO'] = 'FALSE'
    if not backend_only:
        check_toolchain()
    supervise(
        root,
        reference,
        serving,
        frozen=frozen,
        no_typecheck=no_typecheck,
        no_reload=no_reload,
        frontend_only=frontend_only,
        backend_only=backend_only,
        open_browser=open_browser,
        reload_dirs=reload_dirs,
    )


def _manifest(config: str | None, output: str | None = None):
    root = Path.cwd().resolve()
    reference = resolve_config(root, config)
    return root, derive_manifest(load_configuration(reference), root, reference, output)


@cli.command()
@click.option('--config')
def lock(config: str | None):
    """Prepare declared dependencies and missing project files without starting a server."""
    root, manifest = _manifest(config)
    prepare_project(root, manifest)


@cli.command()
@click.option('--config')
@click.option('--output', type=click.Path(file_okay=False))
@click.option('--no-deps-build', is_flag=True)
def build(config: str | None, output: str | None, no_deps_build: bool):
    """Build deployable output from frozen dependency files, without repairing them."""
    root, manifest = _manifest(config, output)
    prepare_project(root, manifest, frozen=True, build=True)
    write_manifest(root, manifest, 'build')
    result = run_plugin(root, 'build', None, *(['--no-deps-build'] if no_deps_build else []))
    click.echo(result.stdout.strip())


@cli.command()
@click.option('--config')
@click.option('--json', 'as_json', is_flag=True)
def check(config: str | None, as_json: bool):
    """Report project diagnostics without repairing files or installing dependencies."""
    diagnostics = []
    try:
        tools = check_toolchain()
        with redirect_stdout(sys.stderr):
            root, manifest = _manifest(config)
        if dependency_plan(root, manifest) or not lockfile_agrees(root):
            raise ProjectError(
                'dependency.drift', 'Project declarations and lockfile disagree; run dara lock and commit the result'
            )
        result = run_plugin(root, 'check', manifest)
        runtime = json.loads(result.stdout)['runtime']
        diagnostics.append(
            {
                'code': 'toolchain.ready',
                'message': f'PATH node {tools["node"]}, pnpm {tools["pnpm"]}; plugin runtime {runtime}',
                'fix': '',
            }
        )
        if (Path(manifest.out_dir) / '.dara-build.json').exists():
            validate_build(root, manifest)
        diagnostics.append({'code': 'project.ready', 'message': 'Frontend project is consistent', 'fix': ''})
    except ProjectError as error:
        diagnostics.append(error.diagnostic.model_dump())
    except Exception as error:
        diagnostics.append(
            {
                'code': 'project.import',
                'message': str(error),
                'fix': 'fix the application configuration, then run dara check',
            }
        )
    if as_json:
        click.echo(json.dumps(diagnostics))
    else:
        for diagnostic in diagnostics:
            click.echo(
                f'{diagnostic["code"]}: {diagnostic["message"]}'
                + (f'. Fix: {diagnostic["fix"]}' if diagnostic['fix'] else '')
            )
    if any(d['fix'] for d in diagnostics):
        raise click.exceptions.Exit(1)


@cli.command(hidden=True)
def setup_custom_js():
    """Explain the removed optional custom-JS setup workflow."""
    raise click.ClickException(
        'Every app now has js/index.tsx. Run dara dev to prepare the project, or dara migrate for legacy configuration.'
    )


@cli.command()
@click.option('--force', is_flag=True, help='Re-create .env even if it exists')
def generate_env(force: bool):
    """Generate the application's Python environment configuration."""
    if Path('.env').is_file() and not force:
        raise click.UsageError('.env file already exists, use --force to re-create it')
    generate_env_file()
