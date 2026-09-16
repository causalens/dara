"""Python-owned project preparation and process boundaries for the Vite pipeline."""

import copy
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
from importlib.metadata import PackageNotFoundError, entry_points, version
from pathlib import Path
from typing import Any

import toml
from filelock import FileLock
from ruamel.yaml import YAML
from semantic_version import NpmSpec
from semantic_version import Version as SemVersion

import click
from dara.core.configuration import Configuration, ConfigurationBuilder
from dara.core.defaults import CORE_ACTIONS, CORE_COMPONENTS
from dara.core.definitions import JsComponentDef
from dara.core.internal.utils import import_config
from dara.core.js_tooling.lockfile import verify_lockfile
from dara.core.js_tooling.migration import migrate_legacy_config
from dara.core.js_tooling.models import (
    FrontendManifest,
    Implementation,
    ModuleDependency,
    ProjectError,
    Requirement,
    StaticSource,
)
from dara.core.js_tooling.processes import ProcessOwner
from dara.core.js_tooling.project_files import (
    InstalledProjectFields,
    PackageFields,
    PreparedRequirements,
    PythonProjectFields,
    read_json,
    read_lockfile,
)
from dara.core.js_tooling.source import source_package
from dara.core.js_tooling.versions import distribution_name
from dara.core.js_tooling.versions import npm_version as convert_npm_version
from dara.core.js_tooling.workspace import read_catalog_peers, read_workspace, reconcile_catalog, workspace_root

ENGINES = {'node': '>=22.12.0', 'pnpm': '>=12 <13'}
RUNTIME_REQUIREMENTS = {
    'react': '^18.3.0',
    'react-dom': '^18.3.0',
    'styled-components': '^5.3.10',
    '@tanstack/react-query': '^4.40.1',
    'recoil': '^0.7.7',
    'recoil-sync': '^0.2.0',
    'react-router': '^7.18.0',
    '@types/react': '^18.3.0',
    '@types/react-dom': '^18.3.0',
    'typescript': '^7.0.0',
    'vite': '^8.1.0',
}


def atomic_write(path: Path, content: str) -> None:
    """Replace one derived or prepared file without exposing partial contents."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def json_text(value: Any) -> str:
    """Encode deterministic project data with a trailing newline."""
    return json.dumps(value, indent=2, ensure_ascii=True) + '\n'


def resolve_config(root: Path, override: str | None = None) -> str:
    """Resolve an override, the app's tool.dara entry, or its conventional config path."""
    if override:
        return override
    try:
        project = toml.load(root / 'pyproject.toml') if (root / 'pyproject.toml').exists() else {}
        configured = PythonProjectFields.parse(project, root / 'pyproject.toml').tool.dara.config
        if configured is not None and ':' not in configured:
            raise ValueError('[tool.dara].config must be a module:object reference')
        return configured or f'{root.name.replace("-", "_")}.main:config'
    except (ValueError, OSError) as exc:
        raise ProjectError('project.config', str(exc), 'edit pyproject.toml') from exc


def load_configuration(reference: str) -> Configuration:
    """Import and discover an app exactly once for a non-serving operation."""
    module, builder = import_config(reference)
    if not isinstance(builder, ConfigurationBuilder):
        raise ProjectError(
            'project.config', f'{reference} must reference a ConfigurationBuilder', 'edit pyproject.toml'
        )
    builder._run_discovery(module)
    return builder._to_configuration()


def npm_version(python_package: str) -> str:
    """Translate installed Python distribution versions to corresponding npm versions."""
    distribution = distribution_name(python_package)
    try:
        installed = version(distribution)
    except PackageNotFoundError as error:
        # Every non-local js_source package is versioned from the Python package that declares it.
        raise ProjectError(
            'dependency.mapping',
            f'{python_package} declares JavaScript sources but is not an installed Python distribution',
            'ship the npm package through an installed Python package; plain npm sources are a post-2.0 feature',
        ) from error
    return convert_npm_version(installed, distribution)


def derive_manifest(
    config: Configuration, root: Path, reference: str, output: str | None = None, *, runtime: bool = False
) -> FrontendManifest:
    """Derive registered implementations and dependency requirements without invoking JS."""
    components = {**CORE_COMPONENTS, **{c.name: c for c in config.components}}
    actions = {**CORE_ACTIONS, **{a.name: a for a in config.actions}}
    js_components = [c for c in components.values() if isinstance(c, JsComponentDef)]
    auth = config.auth_config.component_config.model_dump()
    package_path = root / 'package.json'
    own_name = PackageFields.parse(read_json(package_path), package_path).name if package_path.exists() else None
    packages = {'@darajs/core': 'dara.core', **{npm: py for py, npm in config.module_dependencies.items()}}
    for definition in [*js_components, *actions.values()]:
        npm = source_package(definition.js_source)
        if npm and npm != own_name:
            previous = packages.setdefault(npm, definition.py_module)
            if previous != definition.py_module:
                raise ProjectError('dependency.mapping', f'{npm} maps to both {previous} and {definition.py_module}')
    for component in auth.values():
        npm = source_package(component['js_source'])
        if npm and npm != own_name:
            packages.setdefault(npm, component['py_module'])
    if own_name is not None:
        packages.pop(own_name, None)
    dara_version = npm_version('dara.core')
    requirements = {
        **RUNTIME_REQUIREMENTS,
        **{npm: '^' + npm_version(py) for npm, py in packages.items()},
        '@darajs/vite-plugin': '^' + dara_version,
    }
    modules = [
        ModuleDependency(python=py, package=npm, source=f'{npm}/setup')
        for py, npm in sorted(config.module_dependencies.items())
    ]
    folders: list[str] = list(
        dict.fromkeys(
            [
                *(str(Path(p).resolve()) for p in config.static_folders),
                *([str(root / 'static')] if (root / 'static').is_dir() else []),
            ]
        )
    )
    for folder in folders:
        if not runtime and not Path(folder).is_dir():
            raise ProjectError(
                'asset.source', f'Static folder does not exist: {folder}', 'edit application static registrations'
            )
    static: list[StaticSource] = []
    used_python = set(packages.values())
    for entry in entry_points(group='dara_assets'):
        package = entry.value.split(':')[0].split('._assets')[0]
        if package not in used_python:
            continue
        assets = entry.load()
        base = Path(assets.base_path).resolve()
        for asset in assets.static_assets:
            source = (base / asset.source).resolve()
            if not source.is_relative_to(base) or (not runtime and not source.exists()):
                raise ProjectError(
                    'asset.source',
                    f'{package}: asset {asset.source} must exist inside {base}',
                    'edit package static_assets',
                )
            static.append(StaticSource(package=package, source=str(source), target=asset.target))
    favicons = sorted(p for folder in folders for p in Path(folder).glob('*.ico'))
    favicon = favicons[0] if favicons else Path(__file__).parent / 'statics' / 'favicon.ico'
    return FrontendManifest(
        configuration=reference,
        dara_version=dara_version,
        python_packages=dict(sorted({**packages, '@darajs/vite-plugin': 'dara.core'}.items())),
        package_requirements=[
            Requirement(name=name, specifier=specifier) for name, specifier in sorted(requirements.items())
        ],
        module_dependencies=modules,
        components=[
            Implementation(name=c.name, source=c.js_source) for c in sorted(js_components, key=lambda c: c.name)
        ],
        actions=[
            Implementation(name=a.name, source=a.js_source) for a in sorted(actions.values(), key=lambda a: a.name)
        ],
        auth=[Implementation(name=source, source=source) for source in sorted({c['js_source'] for c in auth.values()})],
        static=static,
        app_static=folders,
        favicon=str(favicon.resolve()),
        out_dir=str((root / (output or config.static_files_dir or 'dist')).resolve()),
    )


def write_manifest(root: Path, manifest: FrontendManifest, operation: str) -> Path:
    """Write an operation's private manifest without disturbing the other operation."""
    path = root / 'node_modules' / '.dara' / f'manifest.{operation}.json'
    content = json_text(manifest.model_dump(by_alias=True))
    if not path.exists() or path.read_text() != content:
        atomic_write(path, content)
    return path


def check_toolchain(*, processes: ProcessOwner | None = None) -> dict[str, str]:
    """Check prerequisites on PATH; Dara never installs a runtime or package manager."""
    found = {}
    run = processes.run if processes else subprocess.run
    for binary, required in ENGINES.items():
        try:
            result = run([binary, '--version'], capture_output=True, text=True, check=True)
            actual = result.stdout.strip().removeprefix('v')
            if not NpmSpec(required).match(SemVersion(actual)):
                raise ValueError(f'found {actual}')
            found[binary] = actual
        except (OSError, ValueError, subprocess.CalledProcessError) as exc:
            raise ProjectError(
                'toolchain.' + binary,
                f'{binary} {required} is required on PATH ({exc})',
                f'install {binary} {required}',
            ) from exc
    return found


def runner_environment() -> dict[str, str]:
    """Forward only runtime, terminal, proxy and explicitly public Vite environment variables."""
    names = {
        'PATH',
        'HOME',
        'TMP',
        'TEMP',
        'TMPDIR',
        'LANG',
        'LANGUAGE',
        'TERM',
        'COLORTERM',
        'NO_COLOR',
        'FORCE_COLOR',
        'CI',
        'NODE_OPTIONS',
        'NODE_EXTRA_CA_CERTS',
        'SYSTEMROOT',
        'WINDIR',
        'COMSPEC',
        'PATHEXT',
        'USERPROFILE',
        'APPDATA',
        'LOCALAPPDATA',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'NO_PROXY',
    }
    return {
        **{key: value for key, value in os.environ.items() if key.upper() in names or key.startswith(('LC_', 'VITE_'))},
        # pnpm 12 otherwise installs implicitly before exec/run, outside preparation's lock.
        'PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN': 'false',
    }


def run_plugin(
    root: Path,
    operation: str,
    manifest: FrontendManifest | None = None,
    *args: str,
    processes: ProcessOwner | None = None,
) -> subprocess.CompletedProcess:
    """Invoke the installed plugin through pnpm, isolating its environment from registry secrets."""
    run = processes.run if processes else subprocess.run
    result = run(
        ['pnpm', '--silent', 'exec', 'dara-vite', operation, '--root', str(root), *args],
        cwd=root,
        input=json_text(manifest.model_dump(by_alias=True)) if manifest is not None else None,
        text=True,
        env=runner_environment(),
        capture_output=True,
        check=False,
    )
    if result.stderr:
        click.echo(result.stderr.rstrip(), err=True)
    if result.returncode:
        try:
            diagnostics = json.loads(result.stdout)
            failure = next(d for d in diagnostics if d.get('fix'))
            raise ProjectError(failure['code'], failure['message'], failure['fix'])
        except (ValueError, KeyError, StopIteration, TypeError):
            raise ProjectError(
                'frontend.runner', f'{operation} failed: {result.stdout.strip()}', 'dara check'
            ) from None
    return result


def _yaml_text(value: dict) -> str:
    stream = io.StringIO()
    YAML().dump(value, stream)
    return stream.getvalue()


def dependency_plan(
    root: Path, manifest: FrontendManifest, *, processes: ProcessOwner | None = None
) -> dict[Path, str]:
    """Plan deterministic edits to Dara-owned entries; detect conflicts before any writes."""
    if (root / 'dara.config.json').exists():
        raise ProjectError(
            'migration.required',
            'Legacy dara.config.json found; review the migration before preparing this project',
            'dara lock',
        )
    snapshot = read_workspace(root, processes=processes)
    workspace = snapshot.root
    package_path, workspace_path = root / 'package.json', workspace / 'pnpm-workspace.yaml'
    original_package = (
        snapshot.projects[root].document
        if root in snapshot.projects
        else {'name': root.name.lower().replace('_', '-'), 'type': 'module', 'private': True}
    )
    package_fields = PackageFields.parse(original_package, package_path)
    dependencies = package_fields.dependency_sections
    package = copy.deepcopy(original_package)
    original_workspace = snapshot.document
    config = copy.deepcopy(original_workspace)
    catalog = reconcile_catalog(
        root,
        manifest,
        snapshot.fields.catalogs.get('dara', {}),
        read_catalog_peers(root, snapshot),
        RUNTIME_REQUIREMENTS,
    )
    config.setdefault('catalogs', {})['dara'] = catalog
    for required in manifest.package_requirements:
        entries = dependencies[required.section]
        existing = entries.get(required.name)
        other_section = 'dependencies' if required.section == 'devDependencies' else 'devDependencies'
        if required.name in dependencies[other_section]:
            raise ProjectError(
                'dependency.reference',
                f'{required.name} belongs in {required.section} as catalog:dara; move the existing {other_section} entry',
            )
        if existing is None:
            entries[required.name] = 'catalog:dara'
            package[required.section] = entries
        elif existing != 'catalog:dara' and not existing.startswith(('workspace:', 'file:', 'link:')):
            raise ProjectError(
                'dependency.reference', f'{required.name} must reference catalog:dara, found {existing!r}'
            )
    engines = package_fields.engines
    for binary, required in ENGINES.items():
        existing = engines.get(binary)
        if existing is None:
            engines[binary] = required
            package['engines'] = engines
        elif existing != required:
            try:
                spec = NpmSpec(existing)
                # Keep compatible user restrictions by intersecting each OR branch.
                # Every nonempty stable semver interval contains a comparator boundary
                # or the next patch after one; inspect the parsed ranges instead of sampling majors.
                candidates = {SemVersion('0.0.0')}

                def boundaries(clause, candidates=candidates):
                    target = getattr(clause, 'target', None)
                    if target is not None:
                        candidates.update((target, target.next_patch(), target.next_minor(), target.next_major()))
                    for child in getattr(clause, 'clauses', ()):
                        boundaries(child)

                boundaries(spec.clause)
                boundaries(NpmSpec(required).clause)
                if not any(spec.match(v) and NpmSpec(required).match(v) for v in candidates):
                    raise ValueError('no supported version')
                intersection = ' || '.join(f'{branch.strip()} {required}' for branch in existing.split('||'))
                if not all(required in branch for branch in existing.split('||')):
                    engines[binary] = intersection
                    package['engines'] = engines
            except ValueError as exc:
                raise ProjectError(
                    'toolchain.engines', f'engines.{binary}={existing!r} conflicts with {required}'
                ) from exc
    planned = {}
    if not package_path.exists() or package != original_package:
        planned[package_path] = json_text(package)
    if not workspace_path.exists() or config != original_workspace:
        planned[workspace_path] = _yaml_text(config)
    return planned


def lockfile_agrees(root: Path, *, processes: ProcessOwner | None = None) -> bool:
    """Delegate effective override, extension, catalog and importer agreement to pnpm."""
    workspace = read_workspace(root, processes=processes)
    lockpath = workspace.root / 'pnpm-lock.yaml'
    if not lockpath.exists() or root not in workspace.projects:
        return False
    lock = read_lockfile(lockpath)
    if root.relative_to(workspace.root).as_posix() not in lock.importers:
        return False
    return verify_lockfile(workspace, processes=processes)


def dependency_fingerprint(root: Path, *, processes: ProcessOwner | None = None) -> str:
    """Identify dependency files used by the last successful local installation."""
    workspace = workspace_root(root)
    digest = hashlib.sha256()
    for path in [
        root / 'package.json',
        workspace / 'pnpm-workspace.yaml',
        workspace / 'pnpm-lock.yaml',
        workspace / 'node_modules' / '.modules.yaml',
    ]:
        digest.update(path.read_bytes() if path.exists() else b'missing')
    for path, package in sorted(read_workspace(root, processes=processes).projects.items()):
        digest.update(str(path.relative_to(workspace)).encode())
        digest.update(json_text(package.document).encode())
    return digest.hexdigest()


def prepare_project(
    root: Path,
    manifest: FrontendManifest,
    *,
    frozen: bool = False,
    build: bool = False,
    processes: ProcessOwner | None = None,
) -> list[str]:
    """Prepare a project under a workspace lock; frozen operations never repair committed files."""
    check_toolchain(processes=processes)
    run = processes.run if processes else subprocess.run
    workspace = workspace_root(root)
    lock_path = workspace / 'node_modules' / '.dara' / 'prepare.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    changed = []
    with processes.lock(lock_path) if processes else FileLock(lock_path):
        if not build:
            changed.extend(str(path.relative_to(workspace)) for path in migrate_legacy_config(root, frozen=frozen))
        planned = dependency_plan(root, manifest, processes=processes)
        agrees = not planned and lockfile_agrees(root, processes=processes)
        if frozen and not agrees:
            raise ProjectError(
                'dependency.drift', 'Project declarations and lockfile disagree; run dara lock and commit the result'
            )
        for path, content in planned.items():
            atomic_write(path, content)
            changed.append(str(path.relative_to(workspace)))
        stamp = root / 'node_modules' / '.dara' / 'installed.json'
        previous = read_json(stamp).get('digest') if stamp.exists() else None
        install = (
            build
            or not agrees
            or previous != dependency_fingerprint(root, processes=processes)
            or not (root / 'node_modules' / '@darajs' / 'vite-plugin').exists()
        )
        try:
            if install:
                command = ['pnpm', 'install', '--frozen-lockfile' if agrees else '--no-frozen-lockfile']
                if workspace != root:
                    command += [
                        '--fail-if-no-match',
                        '--filter',
                        '{./' + root.relative_to(workspace).as_posix() + '}...',
                    ]
                # Registry placeholders require the complete environment for installation only.
                policy = run(
                    ['pnpm', 'config', 'get', 'strictDepBuilds'],
                    cwd=workspace,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                if policy.returncode:
                    raise ProjectError(
                        'dependency.install',
                        f'pnpm could not read its installation policy: {policy.stderr.strip()}',
                        'fix pnpm configuration, then run dara lock',
                    )
                environment = dict(os.environ)
                if policy.stdout.strip() == 'undefined':
                    # Leave scripts unapproved and surface pnpm's diagnostic; respect an explicit policy.
                    environment['PNPM_CONFIG_STRICT_DEP_BUILDS'] = 'false'
                result = run(command, cwd=workspace, env=environment, text=True, capture_output=True, check=False)
                for output in (result.stdout, result.stderr):
                    if output:
                        click.echo(output.rstrip(), err=True)
                if result.returncode:
                    raise ProjectError(
                        'dependency.install',
                        'pnpm installation failed; check the registry route, .npmrc environment placeholders and the pnpm diagnostic above',
                    )
                if not agrees:
                    changed.append(str((workspace / 'pnpm-lock.yaml').relative_to(workspace)))
            initialized = run_plugin(root, 'check-project' if frozen else 'init', manifest, processes=processes)
            if initialized.stdout.strip():
                payload = json.loads(initialized.stdout)
                if isinstance(payload, dict):
                    changed.extend(payload.get('created', []))
            atomic_write(
                stamp,
                json_text(
                    InstalledProjectFields(
                        digest=dependency_fingerprint(root, processes=processes),
                        pythonEnvironment=sys.prefix,
                        requirements=PreparedRequirements.from_manifest(manifest),
                    ).model_dump()
                ),
            )
        except Exception:
            if changed:
                click.echo(
                    'Preparation left these files for review: '
                    + ', '.join(changed)
                    + '. Fix the error and retry dara dev or dara lock.',
                    err=True,
                )
            raise
    if changed:
        click.echo('Prepared frontend project. Commit: ' + ', '.join(changed), err=True)
    return changed
