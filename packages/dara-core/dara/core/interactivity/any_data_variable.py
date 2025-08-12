from typing_extensions import TypeAlias

from dara.core.interactivity.any_variable import AnyVariable

# re-export for backwards compatibility
from .tabular_variable import *  # noqa: F403

AnyDataVariable: TypeAlias = AnyVariable
"""
Deprecated alias. Tabular variables are now DerivedVariable or ServerVariable
"""
