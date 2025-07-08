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

import inspect
from collections import OrderedDict
from functools import wraps
from inspect import Signature, signature
from typing import Callable


class ProgressUpdater:
    """
    The ProgressUpdater class provides a simple API to send live updates about the progress
    of the currently running task to the user.

    An instance of ProgressUpdater is injected into a task function with the @track_progress decorator.
    """

    def __init__(self, updater_method: Callable):
        self.updater_method = updater_method

    def send_update(self, progress: float, message: str):
        """
        Update the progress for the running task

        :param progress: Current progress 0-100
        :param message: Message describing current progress
        """
        self.updater_method(progress, message)

    def fake_progress(self, progress_end: float, message: str, estimated_time: float = 0):
        """
        Fake progress for the running task.
        Can be used right before starting an operation which cannot be progress-tracked.
        If estimated_time is provided, the progress bar shows estimated progress for some time before showing a 'fake' progress.

        :param progress_end: progress after the operation ends - the fake progress won't increase after that point
        :param estimated_time: optionally, provide an estimate on how long the operation should take (in milliseconds)
        :param message: message to show while the fake progress is running
        """
        self.updater_method(progress_end, f'FAKE_PROGRESS__{estimated_time}__{message}')


def track_progress(func=None):
    """
    Task function decorator which injects a ProgressUpdater instance into a keyword argument with
    type annotation of ProgressUpdater.

    Example usage:


    ```python


    from dara.core.progress_updater import ProgressUpdater, track_progress

    @track_progress
    def task_function(some_argument: str, updater: ProgressUpdater):
       for i in range(10):
           updater.send_update((i / 10) * 100, f'Step {i}')
           # Some computation step...

       updater.send_update(100, 'Done')
       return some_argument

    ```

    Intercepts `__send_update` keyword argument which is injected into kwargs by TaskManager when the task is
    ran and uses it to instantiate the ProgressUpdater object.
    """
    if func is None:
        raise ValueError('No function provided for decorator @track_progress')

    new_annotations = {}
    old_signature = signature(func)
    params = OrderedDict()

    injection_key = None

    for var_name, typ in func.__annotations__.items():
        # Try to find injection key for the Progress Updater
        if typ == ProgressUpdater:
            injection_key = var_name

        # Return type should not be in the signature's params but is in the annotations dict
        if var_name != 'return':
            params[var_name] = old_signature.parameters.get(var_name)
        new_annotations[var_name] = typ

    if injection_key is None:
        raise ValueError(
            "Couldn't find an annotation matching the type ProgressUpdater - function wrapped"
            ' by @track_progress needs to provide a kwarg annotated with ProgressUpdater'
        )

    _inner_func = None

    if inspect.iscoroutinefunction(func):

        @wraps(func)
        async def _async_inner_func(*args, **kwargs):
            if '__send_update' not in kwargs:
                raise ValueError(
                    f'Key __send_update not found in kwargs of function {func.__name__} wrapped by @track_progress. "\
                    "The updater method is automatically injected when running the function via Task Pool - "\
                    "the wrapped function should not be ran manually.'
                )

            # Remove updater from kwargs
            updater = kwargs['__send_update']
            inner_kwargs = {key: val for key, val in kwargs.items() if key != '__send_update'}

            return await func(*args, **{injection_key: ProgressUpdater(updater)}, **inner_kwargs)

        _inner_func = _async_inner_func
    else:

        @wraps(func)
        def _sync_inner_func(*args, **kwargs):
            if '__send_update' not in kwargs:
                raise ValueError(
                    f'Key __send_update not found in kwargs of function {func.__name__} wrapped by @track_progress. "\
                    "The updater method is automatically injected when running the function via Task Pool - "\
                    "the wrapped function should not be ran manually.'
                )

            # Remove updater from kwargs
            updater = kwargs['__send_update']
            inner_kwargs = {key: val for key, val in kwargs.items() if key != '__send_update'}

            return func(*args, **{injection_key: ProgressUpdater(updater)}, **inner_kwargs)

        _inner_func = _sync_inner_func

    _inner_func.__signature__ = Signature(  # type: ignore
        parameters=list(params.values()),
        return_annotation=old_signature.return_annotation,
    )

    # Store metadata on the wrapped function - keep a reference to the function wrapped and the decorator itself
    _inner_func.__wrapped__ = func
    _inner_func.__wrapped_by__ = track_progress  # type: ignore

    return _inner_func
