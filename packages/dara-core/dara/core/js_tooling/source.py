"""Parse JavaScript implementation specifiers at the Python registration boundary."""

import posixpath
import re
from typing import Annotated

from pydantic import AfterValidator

_PACKAGE = re.compile(r'^(?:@[a-z0-9._-]+/)?[a-z0-9._-]+(?:/[\w./-]+)?$')


def parse_js_source(value: str) -> str:
    """Accept a package import or an app-relative implementation contained in ``js/``."""
    if value.startswith('./'):
        normalized = posixpath.normpath(value)
        if normalized.startswith('js/') and '\\' not in value:
            return './' + normalized
    elif _PACKAGE.fullmatch(value) and not value.startswith(('.', '/', '#')):
        if all(part not in ('.', '..') for part in value.split('/')):
            return value
    raise ValueError(
        f'Invalid js_source {value!r}: use a package subpath or a relative path under ./js/; see the Dara 2.0 migration guide for legacy declarations'
    )


def source_package(source: str) -> str | None:
    """Extract the npm package name from a parsed source; local sources have none."""
    if source.startswith('./'):
        return None
    return '/'.join(source.split('/')[:2]) if source.startswith('@') else source.split('/', maxsplit=1)[0]


JsSource = Annotated[str, AfterValidator(parse_js_source)]
