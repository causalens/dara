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

from __future__ import annotations

from collections.abc import Coroutine
from typing import Any, Callable, List, Optional, Union

from pandas import DataFrame
from typing_extensions import deprecated

from dara.core.base_definitions import (
    Cache,
    CacheArgType,
)
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.derived_variable import (
    DerivedVariable,
)


@deprecated(
    'DerivedDataVariable is deprecated and will be removed in a future version. Use dara.core.interactivity.derived_variable.DerivedVariable instead, it can now return DataFrames'
)
class DerivedDataVariable(DerivedVariable):
    """
    DerivedDataVariable represents a variable designed to hold datasets computed
    by a resolver function like a normal DerivedVariable.

    Note: the resolver function must return a DataFrame.
    """

    def __init__(
        self,
        func: Union[
            Callable[..., Union[DataFrame, None]],
            Callable[..., Coroutine[Any, Any, Union[DataFrame, None]]],
        ],
        variables: List[AnyVariable],
        cache: CacheArgType = Cache.Type.GLOBAL,
        run_as_task: bool = False,
        polling_interval: Optional[int] = None,
        deps: Optional[List[AnyVariable]] = None,
        uid: Optional[str] = None,
    ) -> None:
        """
        DerivedDataVariable represents a variable designed to hold datasets computed
        by a resolver function like a normal DerivedVariable.

        Note: the resolver function must return a DataFrame.

        :param func: the function to derive a new value from the input variables. Must return a DataFrame
        :param variables: a set of input variables that will be passed to the deriving function
        :param default: the initial value for the variable, defaults to None
        :param cache: whether to cache the result, defaults to global caching. Other options are to cache per user
                      session, or per user
        :param run_as_task: whether to run the calculation in a separate process, recommended for any CPU intensive
                            tasks, defaults to False
        :param polling_interval: an optional polling interval for the DerivedVariable. Setting this will cause the
                             component to poll the backend and refresh itself every n seconds.
        :param deps: an optional array of variables, specifying which dependant variables changing should trigger a
                        recalculation of the derived variable
        - `deps = None` - `func` is ran everytime (default behaviour),
        - `deps = []` - `func` is ran once on initial startup,
        - `deps = [var1, var2]` - `func` is ran whenever one of these vars changes
        :param uid: the unique identifier for this variable; if not provided a random one is generated
        """
        super().__init__(
            func=func,
            cache=cache,
            uid=uid,
            variables=variables,
            polling_interval=polling_interval,
            deps=deps,
            run_as_task=run_as_task,
        )
