"""Rewrite standalone development commands without interpreting arbitrary shell programs."""

import shlex
from dataclasses import dataclass


@dataclass(frozen=True)
class CommandRewrite:
    """A command replacement, or the reason its original text needs manual review."""

    text: str
    issue: str | None = None
    notice: str | None = None


def rewrite_command(line: str) -> CommandRewrite:
    """Migrate a literal standalone Dara invocation while preserving its indentation and newline."""
    if 'dara start' not in line or line.lstrip().startswith('#'):
        return CommandRewrite(line)
    manual = CommandRewrite(
        line,
        'Review this shell command manually: use dara dev for development, or separate dara build and dara start for deployment.',
    )
    # These characters introduce shell evaluation, comments, continuations or other commands.
    # Reject even quoted occurrences rather than trying to implement a shell parser.
    if any(character in line for character in ';|&<>#$`\\()'):
        return manual
    try:
        tokens = shlex.split(line)
    except ValueError:
        return manual
    prefixes = ((), ('poetry', 'run'), ('exec',), ('RUN',), ('RUN', 'poetry', 'run'))
    offset = next(
        (len(prefix) for prefix in prefixes if tokens[: len(prefix) + 2] == [*prefix, 'dara', 'start']),
        None,
    )
    if offset is None:
        return manual
    arguments = tokens[offset + 2 :]
    options = {argument.split('=', 1)[0] for argument in arguments}
    if options & {'--production', '--skip-jsbuild', '--rebuild'}:
        return manual
    development = bool(options & {'--reload', '--enable-hmr'})
    if development and '--docker' in options:
        return manual
    if not development and '--docker' not in options:
        return manual if '--dev-port' in options else CommandRewrite(line)
    rewritten = [*tokens[:offset], 'dara', 'dev' if development else 'start']
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        option = argument.split('=', 1)[0]
        if option in {'--reload', '--enable-hmr', '--docker'}:
            if argument != option:
                return manual
        elif option == '--dev-port':
            if not development:
                return manual
            if '=' in argument:
                port = argument.split('=', 1)[1]
            else:
                index += 1
                if index == len(arguments):
                    return manual
                port = arguments[index]
            if not port.isdigit():
                return manual
        else:
            rewritten.append(argument)
        index += 1
    notice = None
    if not development:
        if '--require-sso' not in options:
            rewritten.append('--require-sso')
        notice = 'Deployment now requires an earlier dara build step.'
    indentation = line[: len(line) - len(line.lstrip(' \t'))]
    newline = '\r\n' if line.endswith('\r\n') else '\n' if line.endswith('\n') else ''
    return CommandRewrite(indentation + shlex.join(rewritten) + newline, notice=notice)
