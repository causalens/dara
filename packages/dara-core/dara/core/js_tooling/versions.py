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
        raise ProjectError(
            'dependency.version',
            f'{distribution} has an invalid Python version: {value}',
            f'reinstall {distribution} from a published release',
        ) from error
    if parsed.post is not None or parsed.local is not None:
        raise ProjectError(
            'dependency.version',
            f'{distribution} has no npm version mapping for {parsed}',
            'install a release, pre-release or dev version; post and local versions are not published to npm',
        )
    # Each pre-release and dev part becomes its own identifier, so 2.0.0a1.dev3 stays distinct from 2.0.0a1.
    identifiers = []
    if parsed.pre:
        label, number = parsed.pre
        identifiers += [dict(a='alpha', b='beta').get(label, label), str(number)]
    if parsed.dev is not None:
        identifiers += ['dev', str(parsed.dev)]
    return parsed.base_version + ('-' + '.'.join(identifiers) if identifiers else '')
