"""Invoke the versioned JavaScript analyzer without preparing or importing the application."""

import json
import os
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from dara.core.js_tooling.migration_plan import MigrationIssue, MigrationPlan, MigrationReadError, SourceRequest
from dara.core.js_tooling.processes import ProcessOwner
from dara.core.js_tooling.project import check_toolchain, npm_version, runner_environment
from dara.core.js_tooling.project_files import ProjectFields


class _WireModel(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid')


class _ToolPackage(ProjectFields):
    name: Literal['@darajs/vite-plugin']
    version: str


class LocalSource(_WireModel):
    """A local runtime export proven by the JavaScript analyzer."""

    kind: Literal['local']
    file: str
    name: str


class PackageSource(_WireModel):
    """A public package subpath resolving to the legacy implementation in both modes."""

    kind: Literal['package']
    source: str


class ManualSource(_WireModel):
    """An unresolved implementation with a concrete manual migration instruction."""

    kind: Literal['manual']
    message: str


class AbsentEntry(_WireModel):
    """No legacy entry module exists."""

    kind: Literal['absent']


class ReadyEntry(_WireModel):
    """An explicit export barrel whose existing setup imports can be preserved."""

    kind: Literal['ready']
    file: str


class ManualEntry(_WireModel):
    """An entry requiring a manual edit before it can be preserved."""

    kind: Literal['manual']
    file: str
    message: str


class TypeScriptConfig(_WireModel):
    """Effective configuration or the preset that will initialize a missing config."""

    kind: Literal['ready']
    typedImports: bool


class _Input(_WireModel):
    path: str
    realpath: str
    text: str | None


class _Directory(_WireModel):
    path: str
    entries: list[str] | None


class Analysis(_WireModel):
    """Parsed analysis output; Python owns the resulting edits and input preflight."""

    schema_version: Literal[1] = Field(alias='schema')
    version: str
    entry: Annotated[AbsentEntry | ReadyEntry | ManualEntry, Field(discriminator='kind')]
    typescript: Annotated[TypeScriptConfig | ManualSource, Field(discriminator='kind')]
    resolutions: list[Annotated[LocalSource | PackageSource | ManualSource, Field(discriminator='kind')]]
    inputs: list[_Input]
    directories: list[_Directory]


def analyzer_command(root: Path, version: str) -> list[str]:
    """Prefer the matching installed CLI, otherwise provision that exact release in pnpm's tool cache."""
    check_toolchain()
    for directory in [root, *root.parents]:
        package = directory / 'node_modules/@darajs/vite-plugin'
        manifest = package / 'package.json'
        if not manifest.is_file():
            continue
        try:
            fields = _ToolPackage.model_validate_json(manifest.read_bytes())
            if fields.version == version:
                executable = package / 'dist/cli.js'
                if executable.is_file():
                    return ['node', str(executable), 'analyze-migration']
        except ValidationError:
            continue
    return [
        'pnpm',
        '--silent',
        '--ignore-workspace',
        f'--package=@darajs/vite-plugin@{version}',
        'dlx',
        'dara-vite',
        'analyze-migration',
    ]


def analyze_sources(plan: MigrationPlan, source_root: Path, requests: list[SourceRequest]) -> Analysis:
    """Analyze one registration batch and adopt every observed input before proposing edits."""
    version = npm_version('dara.core')
    payload = {
        'schema': 1,
        'version': version,
        'root': str(plan.root),
        'sourceRoot': str(source_root),
        'registrations': [{'module': request.module, 'name': request.export_name} for request in requests],
    }
    try:
        command = analyzer_command(plan.root, version)
        processes = ProcessOwner()
        try:
            result = processes.run(
                command,
                input=json.dumps(payload),
                cwd=plan.root,
                # Tool provisioning needs the user's registry configuration. The analyzer
                # parses application text and never executes the app or its Vite plugins.
                env={**os.environ, 'PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN': 'false'}
                if command[0] == 'pnpm'
                else runner_environment(),
                capture_output=True,
            )
        finally:
            processes.close()
        if result.returncode:
            raise ValueError(result.stdout.strip() or result.stderr.strip() or 'JavaScript analyzer failed')
        analysis = Analysis.model_validate_json(result.stdout)
        if analysis.version != version or len(analysis.resolutions) != len(requests):
            raise ValueError('JavaScript analyzer returned a mismatched version or registration batch')
        for item in analysis.inputs:
            path = Path(item.path)
            if not path.is_absolute() or str(path.resolve()) != item.realpath or plan.read(path) != item.text:
                raise ValueError(f'{path} changed during migration analysis; rerun the command')
        for directory in analysis.directories:
            plan.observe_directory(Path(directory.path), directory.entries)
        return analysis
    except (OSError, ValueError, ValidationError) as error:
        raise MigrationReadError(
            MigrationIssue(
                source_root,
                1,
                f'Cannot analyze JavaScript sources: {error}. Install matching frontend tooling or set literal js_source declarations manually.',
            )
        ) from error
