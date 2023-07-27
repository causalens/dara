import numpy
import pytest

from dara.components.smart.code_editor.util import run_script

# Some scripts need to be defined like this so they can be indented correctly

simple_script = """result = 1 + 10
arr = []
arr.append(result)
return_val = result
"""

dunder_script = """result = []
result.__name__ = 'test'
"""

dunder_script_2 = """result = []
name = result.__subclasses__()
"""

test_function_call = """
def test_func():
    return 'test'

# Then try call the function
test_func()
"""

scoping_script_1 = """
def test_func():
    # Rebind open in the function scope
    open = 'test'

# Then try and use it outside
open("test_file")
"""

scoping_script_2 = """
with test_func() as fp:
    # Rebind open in the with scope
    open = 'test'

# Then try and use it outside
open("test_file")
"""


def test_simple_script():
    """Test that simple scripts are parsed correctly and allowed"""
    result = run_script(simple_script)
    assert result == 11


def test_simple_injection():
    """Test that injections work"""
    result = run_script('return_val = x + 10', injections={'x': 1})
    assert result == 11


def test_imports_blocked():
    """Test that import statements are blocked correctly"""

    with pytest.raises(SyntaxError):
        run_script('import math')

    with pytest.raises(SyntaxError):
        run_script('from typing import List, Optional')


def test_dunders_blocked():
    """Test that calls to dunder functions are blocked"""

    with pytest.raises(SyntaxError):
        run_script(dunder_script)

    with pytest.raises(SyntaxError):
        run_script(dunder_script_2)


def test_inbuilts_blocked():
    """Test that inbuilt functions are blocked based on the passed whitelist"""

    with pytest.raises(SyntaxError):
        run_script('open("some_file")')

    # This should be okay as numpy is in the whitelist
    run_script('numpy.array([0])', injections={'numpy': numpy})

    # Test that functions defined in the script can be called
    run_script(test_function_call)

    # Check some more complex scoping issues
    with pytest.raises(SyntaxError):
        run_script(scoping_script_1)

    with pytest.raises(SyntaxError):
        run_script(scoping_script_2)
