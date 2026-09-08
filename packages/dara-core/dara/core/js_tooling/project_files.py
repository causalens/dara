"""Parse the project-file fields Dara consumes without rewriting user-owned data."""

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError
from typing_extensions import Self

from dara.core.js_tooling.models import ProjectError


class ProjectFields(BaseModel):
    """Strict read projections; retain the original document separately for edits."""

    model_config = ConfigDict(strict=True, extra='ignore')

    @classmethod
    def parse(cls, value: Any, path: Path) -> Self:
        """Attach the source file and field location to malformed-input diagnostics."""
        try:
            return cls.model_validate(value)
        except ValidationError as exc:
            details = '; '.join(
                f'{".".join(str(part) for part in error["loc"])}: {error["msg"]}'
                for error in exc.errors(include_input=False, include_url=False)
            )
            raise ProjectError('project.file', f'{path}: {details}', f'edit {path}') from exc


class PackageFields(ProjectFields):
    """Package identity, dependency references and supported toolchain declarations."""

    name: str | None = None
    dependencies: dict[str, str] = Field(default_factory=dict)
    devDependencies: dict[str, str] = Field(default_factory=dict)
    optionalDependencies: dict[str, str] = Field(default_factory=dict)
    engines: dict[str, str] = Field(default_factory=dict)

    @property
    def dependency_sections(self) -> dict[str, dict[str, str]]:
        """Expose the pnpm dependency sections with their parsed references."""
        return {
            'dependencies': self.dependencies,
            'devDependencies': self.devDependencies,
            'optionalDependencies': self.optionalDependencies,
        }


class WorkspaceFields(ProjectFields):
    """Named catalogs used for Dara's dependency requirements."""

    catalogs: dict[str, dict[str, str]] = Field(default_factory=dict)


class LockedDependency(ProjectFields):
    """The declared reference recorded alongside a pnpm resolution."""

    specifier: str


class LockedImporter(ProjectFields):
    """Only dependency sections participate in app lockfile freshness checks."""

    dependencies: dict[str, LockedDependency] = Field(default_factory=dict)
    devDependencies: dict[str, LockedDependency] = Field(default_factory=dict)
    optionalDependencies: dict[str, LockedDependency] = Field(default_factory=dict)

    @property
    def dependency_sections(self) -> dict[str, dict[str, LockedDependency]]:
        """Expose parsed lock entries under pnpm's section names."""
        return {
            'dependencies': self.dependencies,
            'devDependencies': self.devDependencies,
            'optionalDependencies': self.optionalDependencies,
        }


class LockfileFields(ProjectFields):
    """Dependency data from the last document in a pnpm lockfile."""

    importers: dict[str, LockedImporter] = Field(default_factory=dict)
    catalogs: dict[str, dict[str, LockedDependency]] = Field(default_factory=dict)


class DaraSettings(ProjectFields):
    """Optional application configuration reference in pyproject.toml."""

    config: str | None = None


class ToolSettings(ProjectFields):
    """Dara's section of the shared Python tool table."""

    dara: DaraSettings = Field(default_factory=DaraSettings)


class PythonProjectFields(ProjectFields):
    """The only pyproject.toml fields needed to resolve application configuration."""

    tool: ToolSettings = Field(default_factory=ToolSettings)


def read_json(path: Path) -> dict[str, Any]:
    """Read a JSON object, reporting malformed project files at the CLI boundary."""
    try:
        value = json.loads(path.read_text())
        if not isinstance(value, dict):
            raise ValueError('expected an object')
        return value
    except (OSError, ValueError) as exc:
        raise ProjectError('project.file', f'{path}: {exc}', f'edit {path}') from exc


def read_yaml(path: Path) -> dict[str, Any]:
    """Read workspace YAML while retaining user comments and formatting."""
    try:
        value = YAML().load(path.read_text())
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError('expected a mapping')
        return value
    except (OSError, ValueError, YAMLError) as exc:
        raise ProjectError('project.file', f'{path}: {exc}', f'edit {path}') from exc


def read_lockfile(path: Path) -> LockfileFields:
    """Parse pnpm's dependency document after any optional toolchain document."""
    try:
        documents = list(YAML().load_all(path.read_text()))
        if not documents:
            raise ValueError('expected a dependency lock document')
    except (OSError, ValueError, YAMLError) as exc:
        raise ProjectError('project.file', f'{path}: {exc}', f'edit {path}') from exc
    return LockfileFields.parse(documents[-1], path)
