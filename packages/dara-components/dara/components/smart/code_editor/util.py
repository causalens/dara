"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import ast
from typing import Any, List, Optional, Union

DEFAULT_WHITELIST = [
    # Inbuilts
    'print',
    'filter',
    'str',
    'int',
    'float',
    'list',
    'dict',
    'len',
    'min',
    'max',
    'type',
]


class ScriptVisitor(ast.NodeVisitor):
    """
    Node visitor to check an script AST for violations.
    """

    _function_blacklist = ['read_pickle', 'read_csv', 'read_fwf']

    def __init__(self, undeclared_whitelist: List[str]):
        self.undeclared_whitelist = undeclared_whitelist
        self.declared_vars: list = []
        super().__init__()

    def _check_dunder(self, node, name: str):
        if name == '__init__':
            return
        if name.startswith('__'):
            raise SyntaxError(f'Dunder definition {name} is not allowed')

    def _check_inbuilt(self, node, name: str):
        if name in self.declared_vars or name in self.undeclared_whitelist:
            return
        raise SyntaxError(f'Inbuilt function {name} is not allowed')

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                self.declared_vars.append(target.id)
        self.generic_visit(node)

    def visit_Attribute(self, node):
        self._check_dunder(node, node.attr)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        self._check_dunder(node, node.name)
        self.declared_vars.append(node.name)
        # Take a copy of the vars declared up to this function
        declared_vars_snapshot = [*self.declared_vars]
        self.generic_visit(node)
        # Reset the declared vars to the snapshot after walking children
        self.declared_vars = declared_vars_snapshot

    def visit_With(self, node):
        # Take a copy of the vars declared up to this function
        declared_vars_snapshot = [*self.declared_vars]
        self.generic_visit(node)
        # Reset the declared vars to the snapshot after walking children
        self.declared_vars = declared_vars_snapshot

    def visit_Name(self, node):
        self._check_inbuilt(node, node.id)
        self._check_dunder(node, node.id)
        self.generic_visit(node)

    def visit_Call(self, node):
        func_name: Optional[str] = None
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            func_name = node.func.attr

        if func_name in self._function_blacklist:
            raise SyntaxError(f'Function {func_name} is not allowed')
        self.generic_visit(node)

    def visit_Import(self, node):
        raise SyntaxError(f'Imports are not allowed: {node.names}')

    def visit_ImportFrom(self, node):
        raise SyntaxError(f'Imports are not allowed: {node.names}')


def run_script(script: str, injections: Union[dict, None] = None, whitelist: List[str] = DEFAULT_WHITELIST) -> Any:
    """
    Run a given script in a "sandbox".
    Disallows imports, most globals except whitelisted ones.
    The function returns the value of a local variable `return_val`, if set.

    :param script: Script to run
    :param injections: extra modules,variables available inside the script
    :param whitelist: list of allowed global inbuilts

    The function can be used as such

    ```python

    from dara.components.smart.code_editor import run_script

    script = \"\"\"value = x + 10
    return_val = value
    \"\"\"
    result = run_script(script, injections={'x': 1}) # 11

    ```

    """
    # Validate that the script is safe
    if injections is None:
        injections = {}
    module: ast.Module = ast.parse(script)
    visitor = ScriptVisitor([*whitelist, *injections.keys()])
    visitor.visit(module)

    # Run the script
    loc: dict = {}
    exec(script, injections, loc)  # nosec B102 # this is unsafe but we make best effort with the above to make it as safe as possible
    return loc.get('return_val')
