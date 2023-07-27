"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import ClassVar

from dara.core.definitions import BaseFallback, JsComponentDef, StyledComponentInstance

DefaultFallbackDef = JsComponentDef(name='DefaultFallback', js_module='@darajs/core', py_module='dara.core')
RowFallbackDef = JsComponentDef(name='RowFallback', js_module='@darajs/core', py_module='dara.core')


class Fallback:
    class Default(BaseFallback, StyledComponentInstance):
        """
        ![FallbackDefault](../../../../../docs/packages/dara-core/assets/FallbackDefault.gif)

        Default placeholder. Displays a flashing dot animation.
        Takes up 100% of the available width and height by default.

        :param suspend_render: bool or int, optional

        Determines the suspense behavior of the component during state updates.

        - If True, the component will always use suspense during state updates.
          This means the component will suspend rendering and show a fallback UI until the new state is ready.

        - If False, the component will always show the previous state while loading the new state.
          This means the component will never suspend during state updates. The fallback UI will only
          be shown on the first render.

        - If a positive integer (default is 200), this denotes the threshold in milliseconds.
          The component will show the previous state while loading the new state,
          but will suspend and show a fallback UI after the given timeout if the new state is not ready.
        """

        py_component: ClassVar[str] = 'DefaultFallback'

    class Row(BaseFallback, StyledComponentInstance):
        """
        ![FallbackRow](../../../../../docs/packages/dara-core/assets/FallbackRow.gif)

        Placeholder for a row of content. Displays a flashing dot animation.
        Takes up 100% of the available width but has a fixed height of 2.5rem by default.

        :param suspend_render: bool or int, optional

        Determines the suspense behavior of the component during state updates.

        - If True, the component will always use suspense during state updates.
          This means the component will suspend rendering and show a fallback UI until the new state is ready.

        - If False, the component will always show the previous state while loading the new state.
          This means the component will never suspend during state updates. The fallback UI will only
          be shown on the first render.

        - If a positive integer (default is 200), this denotes the threshold in milliseconds.
          The component will show the previous state while loading the new state,
          but will suspend and show a fallback UI after the given timeout if the new state is not ready.
        """

        py_component: ClassVar[str] = 'RowFallback'
