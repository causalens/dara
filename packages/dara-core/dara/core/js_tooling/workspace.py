"""Parse pnpm membership once and reconcile the requirements owned by its applications."""

import json
import os
import re
import subprocess
from dataclasses import dataclass
from importlib.metadata import distributions
from pathlib import Path
from typing import Any

from dara.core.js_tooling.models import FrontendManifest, ProjectError
from dara.core.js_tooling.processes import ProcessOwner
from dara.core.js_tooling.project_files import (
    InstalledProjectFields,
    PackageFields,
    PreparedRequirements,
    ProjectFields,
    WorkspaceFields,
    read_json,
    read_yaml,
)
from dara.core.js_tooling.versions import distribution_name, npm_version


@dataclass(frozen=True)
class WorkspaceProject:
    """One declared member, retaining its document separately from consumed typed fields."""

    root: Path
    document: dict[str, Any]
    fields: PackageFields


@dataclass(frozen=True)
class WorkspaceSnapshot:
    """The same declared membership and catalog inputs used by planning and freshness."""

    root: Path
    document: dict[str, Any]
    fields: WorkspaceFields
    projects: dict[Path, WorkspaceProject]


class _Member(ProjectFields):
    path: str


class _Membership(ProjectFields):
    projects: list[_Member]


# Only membership is cached. Manifest contents, requirements and Python environments
# are read afresh. The cache key includes workspace configuration and package-path
# additions/deletions, so supervisor polling needs no recurring pnpm subprocess.
_membership: dict[tuple[Path, bytes, tuple[Path, ...]], tuple[Path, ...]] = {}


def workspace_root(root: Path) -> Path:
    """Find the nearest pnpm workspace, or use a standalone app's root."""
    return next((path for path in [root, *root.parents] if (path / 'pnpm-workspace.yaml').is_file()), root)


def _candidate_paths(root: Path, patterns: list[str]) -> tuple[Path, ...]:
    # pnpm excludes hidden directories from wildcards, but explicitly dotted
    # patterns can select them. This only broadens cache invalidation; pnpm itself
    # decides membership, including braces, extglobs and negations.
    hidden = any(
        re.search(r'(?:^|[({,|])\\?\.(?![)},|]|$)', segment)
        for pattern in patterns
        if not pattern.startswith('!')
        for segment in pattern.split('/')
        if segment not in ('.', '..')
    )

    def failed(error: OSError) -> None:
        raise ProjectError('project.file', str(error), f'check permissions under {root}')

    candidates = []
    for directory, children, files in os.walk(root, followlinks=False, onerror=failed):
        children[:] = sorted(
            name for name in children if name not in ('node_modules', '.git') and (hidden or not name.startswith('.'))
        )
        if 'package.json' in files:
            candidates.append(Path(directory))
    return tuple(sorted(candidates))


def _query_members(root: Path, processes: ProcessOwner | None = None) -> tuple[Path, ...]:
    run = processes.run if processes else subprocess.run
    try:
        result = run(
            ['pnpm', '--silent', '--recursive', 'list', '--depth', '-1', '--json'],
            cwd=root,
            env={
                **os.environ,
                'PNPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS': 'false',
                'PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN': 'false',
            },
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ProjectError(
            'workspace.members', f'Cannot read pnpm workspace membership: {error}', 'check pnpm configuration'
        ) from error
    if result.returncode:
        raise ProjectError(
            'workspace.members',
            f'Cannot read pnpm workspace membership: {result.stderr.strip() or result.stdout.strip()}',
            'fix pnpm-workspace.yaml and package.json declarations',
        )
    try:
        payload = json.loads(result.stdout)
    except ValueError as error:
        raise ProjectError(
            'workspace.members', 'pnpm returned invalid workspace membership JSON', 'check the active pnpm executable'
        ) from error
    parsed = _Membership.parse({'projects': payload}, root / 'pnpm-workspace.yaml')
    members = tuple(sorted(Path(member.path).resolve() for member in parsed.projects))
    if any(not member.is_relative_to(root) for member in members):
        raise ProjectError(
            'workspace.members', 'pnpm reported a member outside its workspace', 'check pnpm-workspace.yaml'
        )
    return members


def read_workspace(root: Path, *, processes: ProcessOwner | None = None) -> WorkspaceSnapshot:
    """Resolve authoritative pnpm membership and parse every consumed member declaration."""
    workspace = workspace_root(root)
    path = workspace / 'pnpm-workspace.yaml'
    document = read_yaml(path) if path.exists() else {}
    fields = WorkspaceFields.parse(document, path)
    if fields.packages:
        key = workspace, path.read_bytes(), _candidate_paths(workspace, fields.packages)
        if key not in _membership:
            members = _query_members(workspace, processes)
            # Retain only the latest inventory for each root.
            for stale in [entry for entry in _membership if entry[0] == workspace]:
                del _membership[stale]
            _membership[key] = members
        members = _membership[key]
    else:
        members = (workspace,) if (workspace / 'package.json').is_file() else ()
    projects = {}
    for member in members:
        package_path = member / 'package.json'
        package = read_json(package_path)
        projects[member] = WorkspaceProject(member, package, PackageFields.parse(package, package_path))
    if root != workspace and (root / 'package.json').exists() and root not in projects:
        raise ProjectError(
            'workspace.member',
            f'{root} is not a declared pnpm workspace member.',
            f'add its directory to {workspace / "pnpm-workspace.yaml"} packages',
        )
    return WorkspaceSnapshot(workspace, document, fields, projects)


def _environment_versions(environment: Path) -> dict[str, str]:
    locations = [*environment.glob('lib/python*/site-packages'), environment / 'Lib/site-packages']
    versions = {}
    for distribution in distributions(path=[str(location) for location in locations if location.is_dir()]):
        name = distribution.metadata['Name']
        if not name:
            raise ProjectError(
                'workspace.environment',
                f'Unnamed Python distribution in {environment}',
                f'repair the Python environment at {environment}',
            )
        normalized = re.sub(r'[-_.]+', '-', name).lower()
        versions[normalized] = distribution.version
    return versions


def _prepared_requirements(project: WorkspaceProject) -> tuple[PreparedRequirements | None, Path]:
    stamp = project.root / 'node_modules/.dara/installed.json'
    installed = InstalledProjectFields.parse(read_json(stamp), stamp) if stamp.exists() else None
    environment = (
        Path(installed.pythonEnvironment) if installed and installed.pythonEnvironment else project.root / '.venv'
    )
    if not environment.is_absolute():
        raise ProjectError(
            'workspace.environment',
            f'{stamp} must record an absolute Python environment path.',
            f'activate the intended Python environment and run dara lock in {project.root}',
        )
    if installed and installed.requirements is not None:
        return installed.requirements, environment
    # Older successful installations did not carry requirement ownership. A
    # worker/build manifest can still provide it without importing another app.
    manifests = [
        file
        for operation in ('dev', 'build')
        if (file := project.root / f'node_modules/.dara/manifest.{operation}.json').is_file()
    ]
    if manifests:
        latest = max(manifests, key=lambda file: file.stat().st_mtime_ns)
        return PreparedRequirements.parse(read_json(latest), latest), environment
    return None, environment


@dataclass(frozen=True)
class CatalogReferences:
    """Package names whose existing shared catalog entries must be preserved."""

    root: Path
    names: frozenset[str]


@dataclass(frozen=True)
class ApplicationRequirements(CatalogReferences):
    """Parsed evidence for a Dara app, separate from reconciliation and filesystem access."""

    environment: Path
    recorded: PreparedRequirements | None
    versions: dict[str, str]


def read_catalog_peers(root: Path, workspace: WorkspaceSnapshot) -> list[CatalogReferences]:
    """Read every sibling's declaration and selected Python environment before planning changes."""
    peers: list[CatalogReferences] = []
    for other, project in workspace.projects.items():
        if other == root:
            continue
        references = {
            name: specifier
            for section in project.fields.dependency_sections.values()
            for name, specifier in section.items()
        }
        names = frozenset(
            name
            for name, reference in references.items()
            if reference == 'catalog:dara' or reference.startswith(('workspace:', 'file:', 'link:'))
        )
        if '@darajs/vite-plugin' in references:
            recorded, environment = _prepared_requirements(project)
            peers.append(
                ApplicationRequirements(other, names, environment, recorded, _environment_versions(environment))
            )
        else:
            peers.append(CatalogReferences(other, names))
    return peers


def reconcile_catalog(
    root: Path,
    manifest: FrontendManifest,
    existing: dict[str, str],
    peers: list[CatalogReferences],
    runtime_requirements: dict[str, str],
) -> dict[str, str]:
    """Compute the shared catalog from parsed peer evidence without reading or writing files."""
    current = {requirement.name: requirement.specifier for requirement in manifest.package_requirements}
    retained = {}
    for peer in peers:
        retained.update({name: existing[name] for name in peer.names if name in existing})
        if not isinstance(peer, ApplicationRequirements):
            continue
        evidence, versions = peer.recorded, peer.versions
        dara = versions.get('dara-core')
        dara_version = (
            npm_version(dara, 'dara-core') if dara is not None else evidence.daraVersion if evidence else None
        )
        if dara_version is not None and dara_version != manifest.dara_version:
            raise ProjectError(
                'workspace.version',
                f'{root} uses Dara {manifest.dara_version}, but {peer.root} uses {dara_version} in {peer.environment}. All apps sharing the dara catalog must use the same Dara version.',
                'align the Python environments, then run dara lock in each app',
            )
        claims = (
            {requirement.name: requirement.specifier for requirement in evidence.packageRequirements}
            if evidence
            else {name: existing[name] for name in peer.names if name in existing}
        )
        ownership = {
            '@darajs/core': 'dara.core',
            '@darajs/vite-plugin': 'dara.core',
            **(evidence.pythonPackages if evidence else {}),
        }
        for name, python in ownership.items():
            normalized = re.sub(r'[-_.]+', '-', distribution_name(python)).lower()
            if normalized in versions:
                claims[name] = '^' + npm_version(versions[normalized], python)
        if dara is not None and dara_version == manifest.dara_version:
            claims.update({name: specifier for name, specifier in runtime_requirements.items() if name in claims})
        for name in peer.names & current.keys() & claims.keys():
            if claims[name] != current[name]:
                raise ProjectError(
                    'workspace.requirement',
                    f'{root} requires {name} {current[name]}, but {peer.root} requires {claims[name]} from {peer.environment}.',
                    'align the Python environments and run dara lock in each app; for old unmapped records, run dara dev in both apps once to refresh requirement ownership',
                )
    return dict(sorted({**retained, **current}.items()))
