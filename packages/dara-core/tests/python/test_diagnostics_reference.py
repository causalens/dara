"""Every diagnostic code emitted by Dara or its Vite plugin is listed in the user reference."""

import ast
import re
from pathlib import Path

from dara.core.js_tooling.project import ENGINES

PACKAGES = Path(__file__).resolve().parents[3]
REFERENCE = PACKAGES / 'dara-core/docs/advanced/diagnostics.md'


def _python_codes() -> set[str]:
    codes = set()
    for file in (PACKAGES / 'dara-core/dara/core').rglob('*.py'):
        for node in ast.walk(ast.parse(file.read_text())):
            if isinstance(node, ast.Call) and getattr(node.func, 'id', None) == 'ProjectError' and node.args:
                code = node.args[0]
                if isinstance(code, ast.Constant):
                    codes.add(code.value)
                elif isinstance(code, ast.BinOp) and isinstance(code.left, ast.Constant):
                    # 'toolchain.' + binary covers every checked binary.
                    codes.update(code.left.value + binary for binary in ENGINES)
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values, strict=True):
                    # Literal diagnostics such as project.ready; websocket close codes are integers.
                    is_code = isinstance(key, ast.Constant) and key.value == 'code'
                    if is_code and isinstance(value, ast.Constant) and isinstance(value.value, str):
                        codes.add(value.value)
    return codes


def _plugin_codes() -> set[str]:
    codes = set()
    for file in (PACKAGES / 'vite-plugin/src').rglob('*.ts'):
        source = file.read_text()
        codes.update(re.findall(r'new ProjectError\(\s*"([a-z]+\.[a-z]+)"', source))
        codes.update(re.findall(r'code: "([a-z]+\.[a-z]+)"', source))
    return codes


def test_every_diagnostic_code_is_documented():
    documented = set(re.findall(r'^\| `([a-z]+\.[a-z]+)`', REFERENCE.read_text(), re.MULTILINE))
    emitted = _python_codes() | _plugin_codes()
    assert emitted, 'no diagnostic codes found; the scan is broken'
    assert sorted(emitted - documented) == [], 'document these codes in docs/advanced/diagnostics.md'
    assert sorted(documented - emitted) == [], 'these documented codes are no longer emitted'
