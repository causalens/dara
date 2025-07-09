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

from typing import ClassVar, Optional, Union  # noqa: F401

from dara.core.definitions import BaseFallback, ComponentInstance, JsComponentDef, StyledComponentInstance  # noqa: F401

DefaultFallbackDef = JsComponentDef(name='DefaultFallback', js_module='@darajs/core', py_module='dara.core')
RowFallbackDef = JsComponentDef(name='RowFallback', js_module='@darajs/core', py_module='dara.core')
CustomFallbackDef = JsComponentDef(name='CustomFallback', js_module='@darajs/core', py_module='dara.core')


class Fallback:
    class Default(BaseFallback):
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

        py_component: ClassVar[Union[str, None]] = 'DefaultFallback'

    class Row(BaseFallback):
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

        py_component: ClassVar[Union[str, None]] = 'RowFallback'

    class Custom(BaseFallback):
        """
        Custom placeholder for a row of content.
        Accepts any other Dara component in `component` prop.

        :param component: The component to render in place of the actual UI if it has not finished loading.
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

        py_component: ClassVar[Union[str, None]] = 'CustomFallback'
        component: StyledComponentInstance
