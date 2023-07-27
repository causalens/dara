"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

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

    class Config:
        extra = 'forbid'
