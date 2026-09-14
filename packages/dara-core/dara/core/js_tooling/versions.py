"""Version translation shared by the current app and workspace environment inspection."""

from packaging.version import InvalidVersion, Version

from dara.core.js_tooling.models import ProjectError


def distribution_name(python_package: str) -> str:
    """Map Dara's import namespaces to their Python distribution names."""
    return python_package.replace('.', '-') if python_package.startswith('dara.') else python_package


def npm_version(value: str, distribution: str) -> str:
    """Translate a supported Python release into its corresponding npm version."""
    try:
        parsed = Version(value)
    except InvalidVersion as error:
        raise ProjectError('dependency.version', f'{distribution} has an invalid Python version: {value}') from error
    if parsed.post is not None or parsed.local is not None:
        raise ProjectError('dependency.version', f'{distribution} has no npm version mapping for {parsed}')
    if parsed.pre:
        label, number = parsed.pre
        return f'{parsed.base_version}-{dict(a="alpha", b="beta").get(label, label)}.{number}'
    if parsed.dev is not None:
        return f'{parsed.base_version}-dev.{parsed.dev}'
    return parsed.base_version
