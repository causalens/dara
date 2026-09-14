"""Parse and verify deployable frontend artifacts without a JavaScript toolchain."""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from dara.core.js_tooling.models import FrontendManifest, ProjectError
from dara.core.js_tooling.project_files import read_json


def _relative_path(value: str) -> str:
    path = PurePosixPath(value)
    if path.is_absolute() or '\\' in value or ':' in value or '..' in path.parts or path.as_posix() != value:
        raise ValueError(f'Build marker path escapes its root or is not canonical: {value}')
    return value


RelativePath = Annotated[str, AfterValidator(_relative_path)]
Fingerprint = Annotated[str, StringConstraints(pattern=r'^[a-f0-9]{64}$')]
InputRoot = Annotated[str, StringConstraints(pattern=r'^(app|workspace|favicon|asset:[0-9]+|appStatic:[0-9]+)$')]
WorkspaceRoot = Annotated[str, StringConstraints(pattern=r'^(\.|\.\.(?:/\.\.)*)$')]


class InputRecord(BaseModel):
    """A content fingerprint relative to a portable build input root."""

    root: InputRoot
    path: RelativePath
    hash: Fingerprint | None
    model_config = ConfigDict(extra='forbid', strict=True)


class DirectoryRecord(BaseModel):
    """A recorded directory inventory that detects additions as well as deletions."""

    root: InputRoot
    path: RelativePath
    files: list[RelativePath]
    recursive: bool = True
    model_config = ConfigDict(extra='forbid', strict=True)


class BuildMarker(BaseModel):
    """Parse the deployed marker before using any of its paths or fingerprints."""

    schema_version: int = Field(alias='schema', ge=1, le=1)
    daraVersion: str
    workspaceRoot: WorkspaceRoot
    contract: dict[str, Any]
    contractDigest: Fingerprint
    inputs: list[InputRecord]
    directories: list[DirectoryRecord]
    environment: dict[str, Fingerprint]
    files: dict[RelativePath, Fingerprint]
    model_config = ConfigDict(extra='forbid', strict=True)


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    ).hexdigest()


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _safe_path(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root.resolve()):
        raise ProjectError('build.marker', f'Build marker path escapes its root: {relative}', 'dara build')
    return candidate


def _tree_files(root: Path, *, recursive: bool = True) -> list[str]:
    """Match the builder's inventory, following internal links and rejecting escapes and cycles."""
    if not root.exists():
        return []
    files: list[str] = []
    visited: set[Path] = set()
    resolved_root = root.resolve()

    def walk(current: Path) -> None:
        real = current.resolve()
        if not real.is_relative_to(resolved_root):
            raise ValueError(f'Input link escapes its root: {current}')
        if real.is_dir():
            if real in visited:
                raise ValueError(f'Cyclic input directory: {current}')
            visited.add(real)
            for child in sorted(current.iterdir()):
                if recursive or not child.is_dir():
                    walk(child)
            visited.remove(real)
        elif real.is_file():
            files.append(current.relative_to(root).as_posix())
        else:
            raise ValueError(f'Missing or unsupported input: {current}')

    walk(root)
    return sorted(files)


def _source_locations(root: Path, manifest: FrontendManifest, marker: BuildMarker) -> dict[str, Path]:
    """Select available roots once; any surviving checkout input requires the whole checkout."""
    locations = {
        'app': root,
        'workspace': (root / marker.workspaceRoot).resolve(),
        **{f'asset:{i}': Path(asset.source) for i, asset in enumerate(manifest.static)},
        **{f'appStatic:{i}': Path(folder) for i, folder in enumerate(manifest.app_static)},
        **({'favicon': Path(manifest.favicon)} if manifest.favicon else {}),
    }
    checkout_records = [
        record for record in [*marker.inputs, *marker.directories] if record.root in ('app', 'workspace')
    ]
    checkout = any(
        _safe_path(locations[record.root], record.path).exists() for record in checkout_records if record.path != '.'
    ) or any(
        _safe_path(locations[tree.root], file).exists()
        for tree in marker.directories
        if tree.root in ('app', 'workspace') and tree.path == '.'
        for file in tree.files
    )
    if checkout:
        return locations
    return {
        name: location for name, location in locations.items() if name not in ('app', 'workspace') and location.exists()
    }


def validate_build(root: Path, manifest: FrontendManifest) -> None:
    """Verify output and available source inputs without invoking a JavaScript toolchain."""
    output = Path(manifest.out_dir)
    try:
        marker = BuildMarker.model_validate(read_json(output / '.dara-build.json'))
        if (
            marker.daraVersion != manifest.dara_version
            or marker.contractDigest != _digest(manifest.portable())
            or marker.contractDigest != _digest(marker.contract)
        ):
            raise ValueError('Registered implementations or Dara versions changed')
        if 'index.html' not in marker.files:
            raise ValueError('Build marker has no HTML template')
        for relative, expected in marker.files.items():
            file = _safe_path(output, relative)
            if not file.is_file() or _hash(file) != expected:
                raise ValueError(f'Changed or missing output: {relative}')
        actual = [file for file in _tree_files(output) if file != '.dara-build.json']
        if actual != sorted(marker.files):
            raise ValueError('The build output file inventory changed')
        locations = _source_locations(root, manifest, marker)
        recorded_roots = {record.root for record in [*marker.inputs, *marker.directories]}
        for name, location in locations.items():
            if name.startswith('appStatic:') and location.exists() and name not in recorded_roots:
                raise ValueError(f'New static source directory: {name}')
        checkout = 'app' in locations
        for entry in marker.inputs:
            location = locations.get(entry.root)
            if not checkout and location is None:
                continue
            if location is None:
                raise ValueError(f'Missing source root: {entry.root}')
            file = _safe_path(location, entry.path)
            if (entry.hash is None and file.exists()) or (
                entry.hash is not None and (not file.is_file() or _hash(file) != entry.hash)
            ):
                raise ValueError(f'Changed or missing input: {entry.root}/{entry.path}')
        for tree in marker.directories:
            location = locations.get(tree.root)
            if not checkout and location is None:
                continue
            if location is None:
                raise ValueError(f'Missing source directory: {tree.root}')
            directory = _safe_path(location, tree.path)
            files = _tree_files(directory, recursive=tree.recursive)
            if not directory.is_dir() or files != sorted(tree.files):
                raise ValueError(f'Changed input inventory: {tree.root}/{tree.path}')
        if checkout:
            for name, fingerprint in marker.environment.items():
                if _digest(os.environ.get(name)) != fingerprint:
                    raise ValueError(f'Changed build environment: {name}')
    except (ValueError, OSError, RuntimeError, ProjectError) as exc:
        raise ProjectError('build.stale', f'{exc}; run dara build', 'dara build') from exc
