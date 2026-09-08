"""Versioned Python/Node contracts for the app-root frontend pipeline."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from dara.core.js_tooling.source import JsSource


class Contract(BaseModel):
    """Strict wire model shared with the JavaScript project loader."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra='forbid')


class Diagnostic(Contract):
    """Stable machine-readable failure with a repairing command."""

    code: str
    message: str
    fix: str


class ProjectError(Exception):
    """Carry a diagnostic across the command boundary without losing its code."""

    def __init__(self, code: str, message: str, fix: str = 'dara lock'):
        self.diagnostic = Diagnostic(code=code, message=message, fix=fix)
        super().__init__(message)


class Requirement(Contract):
    """A dependency reference owned by Dara's named catalog."""

    name: str
    section: Literal['dependencies', 'devDependencies'] = 'devDependencies'
    specifier: str


class Implementation(Contract):
    """An existing serialized runtime name and its default-export implementation."""

    name: str
    source: JsSource


class ModuleDependency(Contract):
    """Explicit setup import and Python distribution used to derive its version."""

    python: str
    package: str
    source: JsSource


class StaticSource(Contract):
    """Resolved package asset source with a target inside its URL namespace."""

    package: str
    source: str
    target: str


class FrontendManifest(Contract):
    """Machine-local requirements for one frontend operation; never deployed."""

    schema_version: Literal[1] = Field(default=1, alias='schema')
    configuration: str
    dara_version: str
    package_requirements: list[Requirement]
    module_dependencies: list[ModuleDependency]
    components: list[Implementation]
    actions: list[Implementation]
    # Auth uses an unauthenticated registry, retaining its existing module/name key.
    auth: list[Implementation] = []
    static: list[StaticSource] = []
    app_static: list[str] = []
    favicon: str | None = None
    out_dir: str

    def portable(self) -> dict:
        """Return runtime-compatible fields, excluding machine paths and diagnostic metadata."""
        return self.model_dump(
            by_alias=True,
            include={
                'schema_version',
                'dara_version',
                'package_requirements',
                'module_dependencies',
                'components',
                'actions',
                'auth',
            },
        )
