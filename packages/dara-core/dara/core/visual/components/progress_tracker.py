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

from pydantic import ConfigDict

from dara.core.definitions import ComponentInstance, JsComponentDef

ProgressTrackerDef = JsComponentDef(name='ProgressTracker', js_module='@darajs/core', py_module='dara.core')


class ProgressTracker(ComponentInstance):
    """
    ProgressTracker component can be used a a placeholder component for @py_components.
    The component will automatically pick up updates from the component's input derived variables which
    are running as tasks and display a progress bar.

    Note: the task needs to be wrapped with @track_progress and provide updates via the injected
    ProgressUpdater instance.

    Example setup:

    ```python

    from dara.core.components import ProgressTracker
    from dara.core.definitions import DerivedVariable, Variable

    from project_module.tasks import task_function

    var = Variable(5)
    dv = DerivedVariable(func=task_function, variables=[var], run_as_task=True)

    @py_component(placeholder=ProgressTracker())
    def test_component(some_value):
        return Text(some_value)

    ```

    """

    model_config = ConfigDict(extra='forbid')
