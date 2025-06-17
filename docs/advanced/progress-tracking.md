---
title: Progress Tracking
---

It is often beneficial to provide the end-user with live progress updates on a long-running task.

Dara provides a simple API to send progress updates from inside a task and display them in the form of a progress bar while a task is running, rather than displaying a plain loading spinner which is the default.

Sometimes progress is hard to track if your computations are not iterative or are done through a third party library. In this case, you can fake the progress to keep the user assured the app is working.

### Using `ProgressUpdater`

The example below shows how to setup your task to send progress updates with the `dara.core.progress_updater.ProgressUpdater`. The task itself is simply looping through a range of 0 to 10 adding one each time to the input and returning the output after the loop is complete. Each time you add one, you can send an update and the progress bar will increment.

First, wrap your task in the `@track_progress` decorator:

```python title=my_app/tasks.py
from dara.core.visual.progress_updater import ProgressUpdater, track_progress

# track_progress decorator injects the ProgressUpdater class instance into the task parameters
# so you must add this to the end of your argument list
@track_progress
def task_function(some_argument: int, updater: ProgressUpdater):
    result = 0
    for i in range(10):
        # Simply call `send_update` with the current progress and a message to show to the user
        updater.send_update((i / 10) * 100, f'Step {i}')

        # Run some expensive computation step...
        result = result + 1

    updater.send_update(100, 'Done')
    return result
```

Then specify the placeholder component for your `@py_component`:

```python title=my_app/main.py
from dara.core import DerivedVariable, Variable

from my_app.tasks import task_function

var = Variable(5)
calculation = DerivedVariable(func=task_function, variables=[var], run_as_task=True)

# Specify that the placeholder component for the py_component should be ProgressTracker
@py_component(track_progress=True)
def show_computation_result(some_value):
    return Text(some_value)

# Show a simple page that let's you run the computation and show the result
config.add_page(
    'TrackComputation',
    content=Stack(
        Button("Compute", onclick=calculation.trigger()),
        show_computation_result(calculation)
    )
)

config.task_module = 'my_app.tasks'
```

Alternatively, you can add progress tracking directly to a component itself with the `track_progress` argument. In this example, you want to add it to the `Text` component.

```python title=my_app/main.py
from dara.core import DerivedVariable, Variable

from my_app.tasks import task_function

var = Variable(5)
calculation = DerivedVariable(func=task_function, variables=[var], run_as_task=True)

# Show a simple page that let's you run the computation and show the result
config.add_page(
    'TrackComputation',
    content=Stack(
        Button("Compute", onclick=calculation.trigger()),
        Text(calculation, track_progress=True)
    )
)

config.task_module = 'my_app.tasks'
```

:::tip
As you can see, the `ProgressUpdater` is helpful when you have a heavy and __iterative__ task. Without iteration your progress bar will linger at the start and jump to the end when the task is finished which gives a similar user experience to the loading wheel.
:::

### Faking Progress

Sometimes it is not possible to give an accurate progress update especially when calling a third party library. For those scenarios the `ProgressUpdater` instance exposes a `fake_progress` method. Calling this method commands the shown progress bar to 'fake' the progress from current progress until a certain point.

The method accepts three parameters:

-   `progress_end` - controls the end point; when fake progress is being shown, it is guaranteed to slowly increase until this point (gradually slowing down) but never go over the specified number
-   `message` - message shown while progress is being faked
-   `estimated_time` - if specified, the progress bar will use an estimate for ~60% of the estimated time before switching to a fake progress; otherwise the progress bar fakes the entire progress until the specified `progress_end`

If another progress update is sent after the faking process began, the faking process stops and the progress bar goes back to waiting for more updates.

```python title=my_app/tasks.py
from dara.core.visual.progress_updater import ProgressUpdater, track_progress

@track_progress
def task_function(some_argument: int, updater: ProgressUpdater):
    result = 0
    for i in range(5):
        # Simply call `send_update` with the current progress and a message to show to the user
        updater.send_update((i / 10) * 100, f'Step {i}')

        # Run some expensive computation step...
        result = result + 1

    # Fake progress from current progress until 80%, estimating it will take 5 seconds
    # In the meantime, show provided message
    updater.fake_progress(
        progress_end=80,
        message='Running third party computation',
        estimated_time=5000
    )

    # Some third party computation
    result = third_party_library.compute(result)

    # This will stop the 'faking' progress, giving us back control over the progress bar
    updater.send_update(80, 'Third party computation finished')

    # Some further computation
    result = result + 2

    updater.send_update(100, 'Done')
    return result
```

### Imperative tasks

Sometimes you may want to run a task upon a specific user action imperatively, rather than declaratively in a DerivedVariable. You can do that using the `run_task` method on `ActionCtx` within [`@action`s](../getting-started/actions#run_task).

Progress updates are then sent in the same way, using the `ProgressUpdater` instance. The difference is that instead of Dara handling displaying and updating a progress tracker component, you are in control of updating the UI in an `on_progres` callback.

```python title=my_app/main.py
from dara.core import action, ActionCtx, Variable
from dara.components import Button
from .tasks import task_function

# variable displaying the current status of the task
status = Variable('Not started')

@action
async def run_my_task(ctx: ActionCtx):
    # whenever a status update is sent from the task, update the status message
    async def on_progress(update: TaskProgressUpdate):
        await ctx.update(status, f'Progress: {update.progress}% - {update.message}')

    # Run the task with 5 as kwarg and update the status message with the result or error
    try:
        result = await ctx.run_task(task_function, kwargs={'some_argument': 5}, on_progress=on_progress)
        await ctx.update(status, f'Result: {result}')
    except Exception as e:
        await ctx.update(status, f'Error: {e}')

Button('Run Task', onclick=run_my_task())
```
