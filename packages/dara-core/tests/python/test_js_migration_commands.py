"""Only proven standalone invocations may be rewritten as development commands."""

import pytest

from dara.core.js_tooling.migration_commands import rewrite_command


@pytest.mark.parametrize(
    'command',
    [
        'dara start --docker && echo finished\n',
        'dara start --reload; worker --reload\n',
        'dara start --docker # deployment\n',
        'echo "dara start --reload"\n',
        'dara start --reload --docker\n',
        'dara start --reload --dev-port "$PORT"\n',
        'dara start --reload --dev-port\n',
        'dara start --production\n',
        'dara start --reload=true\n',
    ],
)
def test_ambiguous_shell_programs_remain_unchanged(command):
    result = rewrite_command(command)
    assert result.text == command
    assert result.issue


@pytest.mark.parametrize(
    ('command', 'expected'),
    [
        ('dara start --reload --enable-hmr --port 9000', 'dara dev --port 9000'),
        ('\tpoetry run dara start --reload --dev-port=1234\n', '\tpoetry run dara dev\n'),
        ('exec dara start --enable-hmr --reload-dir app\r\n', 'exec dara dev --reload-dir app\r\n'),
        ('RUN dara start --docker\n', 'RUN dara start --require-sso\n'),
        ('dara start --docker --require-sso', 'dara start --require-sso'),
    ],
)
def test_standalone_commands_preserve_remaining_arguments_and_line_layout(command, expected):
    result = rewrite_command(command)
    assert result.text == expected
    assert result.issue is None


def test_current_commands_are_unchanged():
    assert rewrite_command('dara start --port 9000').text == 'dara start --port 9000'
    assert rewrite_command('dara dev --port 9000').issue is None
    assert rewrite_command('# Old command: dara start --reload').issue is None
