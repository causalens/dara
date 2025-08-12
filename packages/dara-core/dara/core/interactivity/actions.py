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

import contextlib
import inspect
import math
import uuid
from collections.abc import Awaitable
from contextvars import ContextVar
from enum import Enum
from functools import partial, update_wrapper
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    ClassVar,
    Dict,
    List,
    Literal,
    Optional,
    TypeVar,
    Union,
    cast,
    overload,
)

import anyio
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from pandas import DataFrame
from pydantic import ConfigDict
from typing_extensions import TypeAlias, deprecated

from dara.core.base_definitions import (
    ActionDef,
    ActionImpl,
    ActionResolverDef,
    AnnotatedAction,
    TaskProgressUpdate,
)
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.interactivity.server_variable import ServerVariable
from dara.core.interactivity.state_variable import StateVariable
from dara.core.internal.download import generate_download_code
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.utils import run_user_handler

# Type-only imports
if TYPE_CHECKING:
    from dara.core.interactivity import (
        AnyVariable,
        DerivedVariable,
        Variable,
    )


class ActionInputs(BaseModel):
    """
    Base class for all action inputs
    """

    model_config = ConfigDict(extra='allow')


class ActionContext(BaseModel):
    """
    Base class for action context

    @deprecated: used in deprecated action wrappers
    """

    extras: List[Any] = []
    inputs: ActionInputs


class ComponentActionInputs(ActionInputs):
    value: Any


class ComponentActionContext(ActionContext):
    """
    ActionContext for actions that only require component value
    """

    inputs: ComponentActionInputs  # type: ignore


class UpdateVariableImpl(ActionImpl):
    """
    Update a given variable to provided value. Can be used standalone for updating to static values.
    For more complex cases use the `@action` decorator and the `ctx.update` method on the injected context.

    ```python
    from dara.core import Variable, UpdateVariableImpl
    from dara.components import Button

    my_var = Variable(0)

    Button(
        'UpdateVariable',
        onclick=UpdateVariableImpl(my_var, 5),
    )

    ```

    :param variable: the variable to update
    :param value: the new value for the variable
    """

    py_name = 'UpdateVariable'

    variable: Union[Variable, ServerVariable]
    value: Any

    INPUT: ClassVar[str] = '__dara_input__'
    """Special value for `value` that will be replaced with the input value"""

    TOGGLE: ClassVar[str] = '__dara_toggle__'
    """Special value for `value` that will toggle the variable value"""

    async def execute(self, ctx: ActionCtx) -> Any:
        if isinstance(self.variable, ServerVariable):
            # Update on the backend
            from dara.core.internal.registries import (
                server_variable_registry,
                utils_registry,
            )

            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

            var_entry = await registry_mgr.get(server_variable_registry, self.variable.uid)
            await ServerVariable.write_value(var_entry, self.value)
            # Don't notify frontend explicitly, all clients will be notified by write_value above
            return None

        # for non-data variables just ping frontend with the new value
        return await super().execute(ctx)


UpdateVariableDef = ActionDef(name='UpdateVariable', js_module='@darajs/core', py_module='dara.core')


class UpdateVariableInputs(ActionInputs):
    old: Any
    new: Any


class UpdateVariableContext(ActionContext):
    inputs: UpdateVariableInputs  # type: ignore


@deprecated('Use @action or `UpdateVariableImpl` for simple cases')
class UpdateVariable(AnnotatedAction):
    """
    @deprecated: Passing in resolvers is deprecated, use `ctx.update` in an `@action` or `UpdateVariableImpl` instead.
    `UpdateVariableImpl` will be renamed to `UpdateVariable` in Dara 2.0.

    The UpdateVariable action can be passed to any `ComponentInstance` prop accepting an action and trigger the update of a Variable or ServerVariable.
    The resolver function takes a Context param which will feed the `inputs`: `old` and `new` as well as any `extras` passed through.

    Below an example of how a resolver might look:

    ```python
    from dara.core import Variable, UpdateVariable
    from dara.components import Button

    my_var = Variable(0)
    x = Variable(1)
    y = Variable(2)
    z = Variable(3)

    def my_resolver(ctx: UpdateVariable.Ctx):
        # The UpdateVariable action has two inputs predefined, old, which is the value of
        # the variable before update, and new which would have for example the selected value
        # of a `Select` component.
        old = ctx.inputs.old
        new = ctx.inputs.new

        # The resolved values of any extras passed are returned as a list
        x, y, z = ctx.extras

        return old + x + y * z

    Button(
        'UpdateVariable',
        onclick=UpdateVariable(variable=my_var, resolver=my_resolver, extras=[x,y,z]),
    )

    ```

    Example of how you could use `UpdateVariable` to toggle between true and false:

    ```python

    from dara.core import Variable, UpdateVariable
    from dara.components import Button

    var = Variable(True)

    Button(
        'Toggle',
        onclick=UpdateVariable(variable=var, resolver=lambda ctx: not ctx.inputs.old),
    )
    ```

    Example of using `UpdateVariable` to sync values:

    ```python

    from dara.core import Variable, UpdateVariable
    from dara.components import Select

    var = Variable('first')

    Select(
        value=Variable('first'),
        items=['first', 'second', 'third'],
        onchange=UpdateVariable(lambda ctx: ctx.inputs.new, var),
    )

    ```
    """

    Ctx: ClassVar[type[UpdateVariableContext]] = UpdateVariableContext

    variable: Union[Variable, ServerVariable]
    extras: Optional[List[AnyVariable]]

    def __init__(
        self,
        resolver: Callable[[UpdateVariableContext], Any],
        variable: Union[Variable, ServerVariable],
        extras: Optional[List[AnyVariable]] = None,
    ):
        """
        :param resolver: a function to resolve the new value for the variable.  Takes one arguments: containing a context of type `Updatevariable.Ctx`
        :param variable: the variable or url variable to update with a new value upon triggering the action
        :param extras: any extra variables to resolve and pass to the resolution function context
        """

        async def _update(ctx: action.Ctx, **kwargs):  # type: ignore
            ctx = cast(ActionCtx, ctx)  # type: ignore
            old = kwargs.pop('old')
            extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
            old_ctx = UpdateVariableContext(inputs=UpdateVariableInputs(old=old, new=ctx.input), extras=extras)
            result = await run_user_handler(resolver, args=(old_ctx,))
            await ctx.update(variable, result)

        # Update the signature of _update to match so @action decorator works
        params = [
            inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.Ctx),
            inspect.Parameter('old', inspect.Parameter.POSITIONAL_OR_KEYWORD),
            *[
                inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
                for idx in range(len(extras or []))
            ],
        ]
        _update.__signature__ = inspect.Signature(params)  # type: ignore

        # Pass in variable and extras as kwargs
        kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}
        kwargs['old'] = variable

        # Construct the annotated action
        annotated_action = action(_update)(**kwargs)

        # Construct the UpdateVariable instance to retain class-like behaviour
        super().__init__(
            uid=annotated_action.uid,
            definition_uid=annotated_action.definition_uid,
            dynamic_kwargs=annotated_action.dynamic_kwargs,
            variable=variable,  # type: ignore
            extras=extras,  # type: ignore
        )


TriggerVariableDef = ActionDef(name='TriggerVariable', js_module='@darajs/core', py_module='dara.core')


class TriggerVariable(ActionImpl):
    """
    Force a recalculation of a DerivedVariable.

    ```python

    from dara.core import action, ConfigurationBuilder, Variable, DerivedVariable, TriggerVariable
    from dara.components import Stack, Button, Text

    config = ConfigurationBuilder()

    var1 = Variable(1)
    var2 = Variable(2)
    der_var = DerivedVariable(lambda x, y: x + y, variables=[var1, var2], deps=[var2])

    @action
    async def update(ctx: action.Ctx, previous_value: int):
        await ctx.update(var_1, previous_value + 1)

    def test_page():
        return Stack(
            # When clicking this button der_var syncs and calculates latest sum value
            Button('Trigger der_var', onclick=TriggerVariable(variable=der_var)),

            # Because var1 is not a deps of der_var changing its value does not trigger an update
            Button('Add 1 to var1', onclick=update(var_1)),

            Stack(Text('der_var: '), Text(der_var), direction='horizontal'),
            Stack(Text('var1: '), Text(var1), direction='horizontal'),
            Stack(Text('var2: '), Text(var2), direction='horizontal'),
        )


    config.add_page(name='Trigger Variable', content=test_page())

    ```
    """

    variable: DerivedVariable
    force: bool = True


NavigateToDef = ActionDef(name='NavigateTo', js_module='@darajs/core', py_module='dara.core')


class NavigateToImpl(ActionImpl):
    """
    Navigate to a given url.

    Basic example of how to use `NavigateToImpl`:

    ```python

    from dara.core import NavigateToImpl, Variable, ConfigurationBuilder
    from dara.components import Stack, Button, Select

    config = ConfigurationBuilder()

    def test_page():
        return Stack(
            # open in the same tab
            Button('Go to Another Page', onclick=NavigateToImpl(url='/another-page')),
        )


    def another_page():
        return Stack(
            # open in a new tab
            Button('Go to Another Page', onclick=NavigateToImpl(url='/test-page', new_tab=True)),
        )


    config.add_page(name='Test Page', content=test_page())
    config.add_page(name='Another Page', content=another_page())

    ```
    """

    py_name = 'NavigateTo'

    url: Optional[str] = None
    new_tab: bool


@deprecated('Use @action or `NavigateToImpl` for simple cases')
def NavigateTo(
    url: Union[str, Callable[[Any], str]], new_tab: bool = False, extras: Optional[List[AnyVariable]] = None
):
    """
    @deprecated: Passing in resolvers is deprecated, use `ctx.navigate` in an `@action` or `NavigateToImpl` instead.

    The NavigateTo action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` and will trigger a change in route
    based on the url passed. The url can be a static string, or it can be a function that will be called with the
    element that triggered the action (the structure of this will depend on the component this action is passed to).

    Basic example of how to use `NavigateTo`:

    ```python

    from dara.core import NavigateTo, Variable
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.components import Stack, Button, Select

    config = ConfigurationBuilder()


    def test_page():
        return Stack(
            # passing url as a static string
            Button('Go to Another Page', onclick=NavigateTo('/another-page')),
        )


    def another_page():
        # passing url as a function based on component value
        return Stack(
            Select(
                value=Variable('/test-page'),
                items=['/test-page', '/another-page', 'https://www.google.com/'],
                onchange=NavigateTo(lambda ctx: ctx.inputs.value),
            )
        )


    config.add_page(name='Test Page', content=test_page(), icon=get_icon('shield-dog'))
    config.add_page(name='Another Page', content=another_page(), icon=get_icon('shield-cat'))

    ```
    """
    # If it's just a string return a static NavigateToImpl
    if isinstance(url, str):
        return NavigateToImpl(url=url, new_tab=new_tab)

    # Otherwise create a new @action with the provided resolver
    async def _navigate(ctx: action.Ctx, **kwargs):  # type: ignore
        ctx = cast(ActionCtx, ctx)  # type: ignore
        extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
        old_ctx = ComponentActionContext(inputs=ComponentActionInputs(value=ctx.input), extras=extras)
        result = await run_user_handler(url, args=(old_ctx,))  # type: ignore
        # Navigate to resulting url
        await ctx.navigate(result, new_tab)

    # Update the signature of _navigate to match so @action decorator works
    params = [
        inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.Ctx),
        *[
            inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
            for idx in range(len(extras or []))
        ],
    ]
    _navigate.__signature__ = inspect.Signature(params)  # type: ignore

    # Pass in variable and extras as kwargs
    kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}
    return action(_navigate)(**kwargs)


NavigateTo.Ctx = ComponentActionContext  # type: ignore


def Logout():
    """
    Logout action, this triggers the UI to logout the user

    Example of adding Logout action to a button:

    ```python

    from dara.core import ConfigurationBuilder, Logout
    from dara.core.auth import BasicAuthConfig
    from dara.components import Stack, Button

    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig(username='test', password='test'))


    def test_page():
        return Stack(Button('Logout', onclick=Logout()))


    config.add_page(name='Logout Page', content=test_page())

    ```
    """
    return NavigateToImpl(url='/logout', new_tab=False)


ResetVariablesDef = ActionDef(name='ResetVariables', js_module='@darajs/core', py_module='dara.core')


class ResetVariables(ActionImpl):
    """
    Reset a number of variables to their default values

    Basic example of resetting a Variable:

    ```python

    from dara.core import Variable, ResetVariables, UpdateVariable
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.components import Stack, Button, Text

    config = ConfigurationBuilder()

    my_var = Variable(0)


    def test_page():
        return Stack(
            Text(my_var),
            # when clicked, 1 is added to my_var
            Button('Add', onclick=UpdateVariable(lambda ctx: ctx.inputs.old + 1, my_var)),
            # when clicked my_var goes back to its initial value: 0
            Button('Reset', onclick=ResetVariables(variables=[my_var])),
        )


    config.add_page(name='ResetVariable', content=test_page(), icon=get_icon('shrimp'))

    ```

    :param variables: list of variables to reset
    """

    variables: List[AnyVariable]


class NotificationStatus(str, Enum):
    CANCELED = 'CANCELED'
    CREATED = 'CREATED'
    ERROR = 'ERROR'
    FAILED = 'FAILED'
    NONE = ''
    QUEUED = 'QUEUED'
    RUNNING = 'RUNNING'
    SUCCESS = 'SUCCESS'
    WARNING = 'WARNING'


NotificationStatusString = Literal[
    'CANCELED', 'CREATED', 'ERROR', 'FAILED', '', 'QUEUED', 'RUNNING', 'SUCCESS', 'WARNING'
]


NotifyDef = ActionDef(name='Notify', js_module='@darajs/core', py_module='dara.core')


class Notify(ActionImpl):
    """
    Notify action, this triggers the UI to create a notification which is presented to the user, with a title and message.

    ```python

    from dara.core import Notify, ConfigurationBuilder

    from dara.components import Stack, Button

    config = ConfigurationBuilder()


    def test_page():
        return Stack(
            Button(
                'Notify',
                onclick=Notify(
                    message='This is the notification message', title='Example', status=Notify.Status.SUCCESS
                ),
            )
        )


    config.add_page(name='Notify Example', content=test_page())

    ```
    """

    key: Optional[str] = None
    message: str
    status: NotificationStatus
    title: str

    Status: ClassVar[type[NotificationStatus]] = NotificationStatus
    Ctx: ClassVar[type[ComponentActionContext]] = ComponentActionContext
    """@deprecated retained for backwards compatibility, to be removed in 2.0"""


class DownloadContentImpl(ActionImpl):
    """
    Download action, downloads a given file

    ```python

    from dara.core import ConfigurationBuilder, DownloadContentImpl
    from dara.components.components import Button, Stack


    config = ConfigurationBuilder()

    def test_page():
        return Stack(
            Button(
                'Download File', onclick=DownloadContentImpl(path='/path/to/file', cleanup_file=False)
            ),
        )


    config.add_page(name='Download Content', content=test_page)

    ```
    """

    code: str

    py_name = 'DownloadContent'


DownloadContentDef = ActionDef(name='DownloadContent', js_module='@darajs/core', py_module='dara.core')


@deprecated('Use @action instead')
def DownloadContent(
    resolver: Callable[[ComponentActionContext], str],
    extras: Optional[List[AnyVariable]] = None,
    cleanup_file: bool = False,
):
    """
    @deprecated This action is deprecated, use `ctx.download_file` in an `@action` instead.

    Download action, downloads a given file

    ```python

    from dara.core import action, ConfigurationBuilder, ServerVariable, DownloadContent
    from dara.components.components import Button, Stack


    # generate data, alternatively you could load it from a file
    df = pandas.DataFrame(data={'x': [1, 2, 3], 'y':[4, 5, 6]})
    my_var = ServerVariable(df)

    config = ConfigurationBuilder()

    def return_csv(ctx: DownloadContent.Ctx) -> str:
        # The file can be created and saved dynamically here, it should then return a string with a path to it
        # To get the component value, e.g. a select component would return the selected value
        component_value = ctx.inputs.value

        # Getting the value of data passed as extras to the action
        data = ctx.extras[0]

        # save the data to csv
        data.to_csv('<PATH_TO_CSV.csv>')
        return '<PATH_TO_CSV.csv>'


    def test_page():
        return Stack(
            Button(
                'Download File', onclick=DownloadContent(resolver=return_csv, extras=[my_var], cleanup_file=False)
            ),
        )


    config.add_page(name='Download Content', content=test_page)

    ```
    """

    async def _download(ctx: action.Ctx, **kwargs):  # type: ignore
        ctx = cast(ActionCtx, ctx)  # type: ignore
        extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
        old_ctx = ComponentActionContext(inputs=ComponentActionInputs(value=ctx.input), extras=extras)
        result = await run_user_handler(resolver, args=(old_ctx,))
        await ctx.download_file(result, cleanup_file)

    # Update the signature of _download to match so @action decorator works
    params = [
        inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.Ctx),
        *[
            inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
            for idx in range(len(extras or []))
        ],
    ]
    _download.__signature__ = inspect.Signature(params)  # type: ignore

    # Pass in extras as kwargs
    kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}

    return action(_download)(**kwargs)


DownloadContent.Ctx = ComponentActionContext  # type: ignore
"""@deprecated retained for backwards compatibility, to be removed in 2.0"""

DownloadVariableDef = ActionDef(name='DownloadVariable', js_module='@darajs/core', py_module='dara.core')


class DownloadVariable(ActionImpl):
    """
    Download action, downloads the content of a given variable as a file.

    Note that as of now variables ran as a task are not supported.

    ```python

    from dara.core import ConfigurationBuilder, DownloadVariable, Variable
    from dara.components import Stack, Button

    config = ConfigurationBuilder()

    my_var = Variable({'foo': 'bar'})

    def test_page():
        return Stack(
            Button(
                'Download Variable',
                onclick=DownloadVariable(variable=my_var, file_name='test_file', type='json'),
            )
        )


    config.add_page(name='Download Variable', content=test_page())

     ```
    """

    variable: AnyVariable
    file_name: Optional[str] = None
    type: Literal['csv', 'xlsx', 'json'] = 'csv'


@deprecated('Use @action instead')
def SideEffect(
    function: Callable[[ComponentActionContext], Any],
    extras: Optional[List[AnyVariable]] = None,
    block: bool = False,
):
    """
    @deprecated: This action is deprecated, use @action instead.

    The SideEffect action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` in order to trigger an arbitrary python function

    Example of how to get values from context in `SideEffect` function:

    ```python

    from dara.core import Variable, SideEffect
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.components import Stack, Select

    config = ConfigurationBuilder()

    x = Variable(0)
    y = Variable(1)
    z = Variable(2)


    def side_effect(ctx: SideEffect.Ctx):
        value = ctx.inputs.value
        x, y, z = ctx.extras

        print('value:', value)
        print(f'x:{x}, y:{y}, z:{z}')


    def test_page():
        return Stack(Select(value=Variable(3), items=[3, 4, 5], onchange=SideEffect(side_effect, extras=[x, y, z])))


    config.add_page(name='SideEffect', content=test_page(), icon=get_icon('kiwi-bird'))
    ```
    """

    async def _effect(ctx: action.Ctx, **kwargs):  # type: ignore
        ctx = cast(ActionCtx, ctx)  # type: ignore
        extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
        old_ctx = ComponentActionContext(inputs=ComponentActionInputs(value=ctx.input), extras=extras)
        # Simply run the user handler
        await run_user_handler(function, args=(old_ctx,))

    # Update the signature of _effect to match so @action decorator works
    params = [
        inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.Ctx),
        *[
            inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
            for idx in range(len(extras or []))
        ],
    ]
    _effect.__signature__ = inspect.Signature(params)  # type: ignore

    # Pass in extras as kwargs
    kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}

    return action(_effect)(**kwargs)


SideEffect.Ctx = ComponentActionContext  # type: ignore
"""@deprecated retained for backwards compatibility, to be removed in 2.0"""

VariableT = TypeVar('VariableT')


class ActionCtx:
    """
    Action execution context passed to an @action-annotated action when it is being executed.

    Exposes `input`, the input value passed to the action by the invoking components,
    and an collection of methods for interacting with the frontend.
    """

    _action_send_stream: MemoryObjectSendStream[ActionImpl]
    """Memory object send stream for pushing actions to send to the frontend."""

    _action_receive_stream: MemoryObjectReceiveStream[ActionImpl]
    """Memory object receive stream for receiving actions to send to the frontend."""

    _on_action: Callable[[Optional[ActionImpl]], Awaitable]
    """Callback for when an action is pushed to the stream."""

    input: Any

    def __init__(self, _input: Any, _on_action: Callable[[Optional[ActionImpl]], Awaitable]):
        self.input = _input
        self._action_send_stream, self._action_receive_stream = anyio.create_memory_object_stream[ActionImpl](
            max_buffer_size=math.inf
        )
        self._on_action = _on_action

    @overload
    async def update(self, variable: ServerVariable, value: Optional[DataFrame]): ...

    @overload
    async def update(self, variable: Variable[VariableT], value: VariableT): ...

    async def update(self, variable: Union[Variable, ServerVariable], value: Any):
        """
        Update a given variable to provided value.

        ```python
        from dara.core import action, Variable
        from dara.components import Button

        my_var = Variable(0)
        x = Variable(1)
        y = Variable(2)
        z = Variable(3)

        @action
        def update(ctx: action.Ctx, my_var_value, x_value, y_value, z_value):
            # The passed in variables are resolved to their values
            return my_var_value + x_value * y_value * z_value

        Button(
            'UpdateVariable',
            onclick=update(my_var, x, y, z),
        )

        ```

        Example of how you could use `ctx.update` to toggle between true and false:

        ```python

        from dara.core import action, Variable
        from dara.components import Button

        var = Variable(True)

        @action
        async def toggle(ctx: action.Ctx, var_value):
            return not var_value

        Button(
            'Toggle',
            onclick=toggle(var),
        )
        ```

        Example of using `ctx.update` to sync values:

        ```python

        from dara.core import action, Variable
        from dara.components import Select

        var = Variable('first')

        @action
        async def sync_var(ctx: action.Ctx):
            await ctx.update(var, ctx.input)

        Select(
            value=Variable('first'),
            items=['first', 'second', 'third'],
            onchange=sync_var(),
        )

        ```

        :param variable: the variable to update
        :param value: the new value for the variable
        """
        return await UpdateVariableImpl(variable=variable, value=value).execute(self)

    async def trigger(self, variable: DerivedVariable, force: bool = True):
        """
        Trigger a given DerivedVariable to recalculate.

        ```python

        from dara.core import action, ConfigurationBuilder, Variable, DerivedVariable
        from dara.core.configuration import ConfigurationBuilder
        from dara.components import Stack, Button, Text

        config = ConfigurationBuilder()

        var1 = Variable(1)
        var2 = Variable(2)
        der_var = DerivedVariable(lambda x, y: x + y, variables=[var1, var2], deps=[var2])

        @action
        async def update(ctx: action.Ctx, previous_value: int):
            await ctx.update(var_1, previous_value + 1)

        @action
        async def trigger(ctx: action.Ctx):
            await ctx.trigger(der_var)

        def test_page():
            return Stack(
                # When clicking this button der_var syncs and calculates latest sum value
                Button('Trigger der_var', onclick=trigger()),

                # Because var1 is not a deps of der_var changing its value does not trigger an update
                Button('Add 1 to var1', onclick=update(var_1)),

                Stack(Text('der_var: '), Text(der_var), direction='horizontal'),
                Stack(Text('var1: '), Text(var1), direction='horizontal'),
                Stack(Text('var2: '), Text(var2), direction='horizontal'),
            )


        config.add_page(name='Trigger Variable', content=test_page())

        ```

        :param variable: the variable to trigger
        :param force: whether to force the recalculation, defaults to True
        """
        return await TriggerVariable(variable=variable, force=force).execute(self)

    async def navigate(self, url: str, new_tab: bool = False):
        """
        Navigate to a given url

        ```python

        from dara.core import action, ConfigurationBuilder, Variable
        from dara.components import Stack, Button, Select

        config = ConfigurationBuilder()

        @action
        async def navigate_to(ctx: action.Ctx, url: str):
            # Navigate to the url provided
            await ctx.navigate(url)


        def test_page():
            return Stack(
                Button('Go to Another Page', onclick=navigate_to('/another-page')),
            )

        @action
        async def navigate_to_input(ctx: action.Ctx):
            # Navigate to the value of the input provided to the action
            await ctx.navigate(ctx.input)

        def another_page():
            return Stack(
                Select(
                    value=Variable('/test-page'),
                    items=['/test-page', '/another-page', 'https://www.google.com/'],
                    onchange=navigate_to_input(),
                )
            )


        config.add_page(name='Test Page', content=test_page())
        config.add_page(name='Another Page', content=another_page())

        ```

        :param url: the url to navigate to
        :param new_tab: whether to open the url in a new tab, defaults to False
        """
        return await NavigateToImpl(url=url, new_tab=new_tab).execute(self)

    async def logout(self):
        """
        Logout the current user.

        ```python

        from dara.core import ConfigurationBuilder, action
        from dara.core.auth import BasicAuthConfig
        from dara.components import Stack, Button

        config = ConfigurationBuilder()
        config.add_auth(BasicAuthConfig(username='test', password='test'))

        @action
        async def logout(ctx: action.Ctx):
            await ctx.logout()

        def test_page():
            return Stack(Button('Logout', onclick=logout()))


        config.add_page(name='Logout Page', content=test_page())

        ```
        """
        return await Logout().execute(self)

    async def notify(
        self,
        message: str,
        title: str,
        status: Union[NotificationStatus, NotificationStatusString],
        key: Optional[str] = None,
    ):
        """
        Display a notification toast on the frontend

        ```python

        from dara.core import action, ConfigurationBuilder
        from dara.components import Stack, Button

        config = ConfigurationBuilder()

        @action
        async def notify(ctx: action.Ctx):
            await ctx.notify(
                message='This is the notification message', title='Example', status='SUCCESS'
            )

        def test_page():
            return Stack(
                Button(
                    'Notify',
                    onclick=notify()
                )
            )


        config.add_page(name='Notify Example', content=test_page())

        ```

        :param message: the message to display
        :param title: the title of the notification
        :param status: the status of the notification
        :param key: optional key for the notification
        """
        if isinstance(status, str):
            status = NotificationStatus(status)

        return await Notify(key=key, message=message, status=status, title=title).execute(self)

    async def reset_variables(self, variables: Union[List[AnyVariable], AnyVariable]):
        """
        Reset a list of variables to their default values.

        ```python

        from dara.core import Variable, action, ConfigurationBuilder
        from dara.components import Stack, Button, Text

        config = ConfigurationBuilder()

        my_var = Variable(0)

        @action
        async def update(ctx: action.Ctx, my_var_value):
            await ctx.update(my_var, my_var_value + 1)

        @action
        async def reset(ctx: action.Ctx):
            await ctx.reset_variables(my_var)

        def test_page():
            return Stack(
                Text(my_var),
                # when clicked, 1 is added to my_var
                Button('Add', onclick=update(my_var)),
                # when clicked my_var goes back to its initial value: 0
                Button('Reset', onclick=reset()),
            )


        config.add_page(name='ResetVariable', content=test_page(), icon=get_icon('shrimp'))

        ```

        :param variables: a variable or list of variables to reset
        """
        variables = [variables] if not isinstance(variables, list) else variables
        return await ResetVariables(variables=variables).execute(self)

    async def download_file(self, path: str, cleanup: bool = False):
        """
        Download a given file.

        ```python

        from dara.core import action, ConfigurationBuilder, ServerVariable
        from dara.components.components import Button, Stack

        # generate data, alternatively you could load it from a file
        df = pandas.DataFrame(data={'x': [1, 2, 3], 'y':[4, 5, 6]})
        my_var = ServerVariable(df)

        config = ConfigurationBuilder()

        @action
        async def download_csv(ctx: action.Ctx, my_var_value: DataFrame) -> str:
            # Getting the value of data passed as extras to the action
            data = my_var_value

            # save the data to csv
            data.to_csv('<PATH_TO_CSV.csv>')

            # Instruct the frontend to download the file and clean up afterwards
            await ctx.download_file(path='<PATH_TO_CSV.csv>', cleanup=True)


        def test_page():
            return Stack(
                Button(
                    'Download File', onclick=download_csv(my_var)
                ),
            )


        config.add_page(name='Download Content', content=test_page)

        ```

        :param path: the path to the file to download
        :param cleanup: whether to delete the file after download
        """
        code = await generate_download_code(path, cleanup)
        return await NavigateToImpl(url=f'/api/core/download?code={code}', new_tab=True).execute(self)

    async def download_variable(
        self, variable: AnyVariable, file_name: Optional[str] = None, type: Literal['csv', 'xlsx', 'json'] = 'csv'
    ):
        """
        Download the content of a given variable as a file.
        Note that the content of the file must be valid for the given type.

        ```python

        from dara.core import action, ConfigurationBuilder, Variable
        from dara.components import Stack, Button

        config = ConfigurationBuilder()

        my_var = Variable({'foo': 'bar'})

        @action
        async def download(ctx: action.Ctx):
            await ctx.download_variable(variable=my_var, file_name='test_file', type='json')

        def test_page():
            return Stack(
                Button(
                    'Download Variable',
                    onclick=download(),
                )
            )


        config.add_page(name='Download Variable', content=test_page())

        ```

        :param variable: the variable to download
        :param file_name: optional name of the file to download
        :param type: the type of the file to download, defaults to csv
        """
        return await DownloadVariable(variable=variable, file_name=file_name, type=type).execute(self)

    async def run_task(
        self,
        func: Callable,
        args: Union[List[Any], None] = None,
        kwargs: Union[Dict[str, Any], None] = None,
        on_progress: Optional[Callable[[TaskProgressUpdate], Union[None, Awaitable[None]]]] = None,
    ):
        """
        Run a calculation as a task in a separate process. Recommended for CPU intensive tasks.
        Returns the result of the task function.

        Note that the function must be defined in a separate module as configured in `task_module` field of the
        configuration builder. This is because Dara spawns separate worker processes only designed to run
        functions from that designated module.

        ```python
        from dara.core import ConfigurationBuilder, TaskProgressUpdate, action, ActionCtx, Variable
        from dara.components import Text, Stack, Button
        from .my_module import my_task_function

        config = ConfigurationBuilder()
        config.task_module = 'my_module'

        status = Variable('Not started')

        @action
        async def my_task(ctx: ActionCtx):
            async def on_progress(update: TaskProgressUpdate):
                await ctx.update(status, f'Progress: {update.progress}% - {update.message}')

            try:
                result = await ctx.run_task(my_task_function, args=[1, 10], on_progress=on_progress)
                await ctx.update(status, f'Result: {result}')
            except Exception as e:
                await ctx.update(status, f'Error: {e}')

        def task_page():
            return Stack(Text('Status display:'), Text(text=status), Button('Run', onclick=my_task()))

        config.add_page(name='task', content=task_page())
        ```

        :param func: the function to run as a task
        :param args: the arguments to pass to the function
        :param kwargs: the keyword arguments to pass to the function
        :param on_progress: a callback to receive progress updates
        """
        from dara.core.internal.registries import utils_registry
        from dara.core.internal.tasks import Task, TaskManager

        task_mgr: TaskManager = utils_registry.get('TaskManager')

        task = Task(func=func, args=args, kwargs=kwargs, on_progress=on_progress)
        task_mgr.register_task(task)
        pending_task = await task_mgr.run_task(task)
        return await pending_task.value()

    async def execute_action(self, action: ActionImpl):
        """
        Execute a given action.

        :param action: the action impl instance to execute
        """
        return await action.execute(self)

    async def _push_action(self, action: ActionImpl):
        """
        Push an action to the frontend
        """
        await self._action_send_stream.send(action)

    async def _handle_results(self):
        """
        Main loop for handling actions being pushed to the context
        """
        async for msg in self._action_receive_stream:
            await self._on_action(msg)

    async def _end_execution(self):
        """
        End execution of the action
        """
        self._action_send_stream.close()


ACTION_CONTEXT = ContextVar[Optional[ActionCtx]]('action_context', default=None)
"""Current execution context"""


def assert_no_context(alternative: str):
    """
    Assert that no action context is active.

    This is used to ensure shortcut actions are not used within an @action as they are synchronous
    and return a simple object, while to execute it once needs to await its execution.
    """
    if ACTION_CONTEXT.get():
        raise ValueError(f'Shortcut actions cannot be used within an @action, use `{alternative}` instead')


BOUND_PREFIX = '__BOUND__'


class action:
    """
    A decorator for creating actions. Actions are used to trigger changes in the UI, such as updating a variable, navigating to a new page, etc.

    The decorator injects an `ActionCtx` object as the first argument to the decorated function, which can be used to access the available
    actions as well as the input value of the component that triggered the action. Note that the context methods are asynchronous,
    so the decorated function must be async to use them.

    An @action-decorated function can be called with a list of Variable and non-Variable arguments. The non-Variable arguments will be passed
    as-is to the decorated function, while the Variable arguments will be passed as the current value of the Variable.

    ```python
    from dara.core import action, Variable
    from dara.components import Select, Item

    some_variable = Variable(1)
    other_variable = Variable(2)

    @action
    async def my_action(ctx: action.Ctx, arg_1: int, arg_2: int):
        # Value coming from the component, in this case the selected item
        value = ctx.input
        # Your action logic...

        # Update `some_variable` to `value` multiplied by arg_1 and arg_2
        await ctx.update(variable=some_variable, value=value * arg_1 * arg_2)


    Select(
        items=[Item(label='item1', value=1), Item(label='item2', value=2)],
        onchange=my_action(2, other_variable)
    )
    ```
    """

    Ctx: TypeAlias = ActionCtx

    def __init__(self, func: Callable[..., Any]):
        from dara.core.internal.execute_action import execute_action
        from dara.core.internal.registries import action_registry

        signature = inspect.signature(func)
        params = list(signature.parameters.values())

        # Validate the signature has at least one parameter as it needs one for ctx at the minimum
        if len(params) < 1 or (params[0].name in ('self', 'cls') and len(params) < 2):
            raise ValueError(
                'Expected at least one parameter for the @action annotated function, but found none. One parameter is required for the ActionCtx to be injected'
            )

        self.func = func
        self.definition_uid = str(uuid.uuid4())

        # Register the definition
        act_def = ActionResolverDef(resolver=func, uid=self.definition_uid, execute_action=execute_action)
        action_registry.register(self.definition_uid, act_def)

        # Modify the function signature
        bound_name: Union[str, None] = None

        # Check if first parameter is 'self' or 'cls' - we have to use the name as otherwise it's
        # not possible to distinguish between a bound method or non-bound method
        # as the decorator runs before the function is bound to the class.
        # Pop the self/cls/ctx params from signature as user is not expected to pass them in (ctx can be passed within action context)
        if params[0].name in ('self', 'cls'):
            bound_name = params[0].name
            # Remove first two parameters (self, ctx, ...)
            params.pop(0)
            params.pop(0)
        else:
            # Remove the first parameter (ctx, ...)
            params.pop(0)

        self.bound_name = bound_name
        self.new_sig = signature.replace(parameters=params)

        # Update the function's __signature__ attribute for correct introspection
        update_wrapper(self, func)  # This transfers attributes like __name__, __doc__, etc.
        self.__signature__ = self.new_sig  # type: ignore

    def __get__(self, instance: Any, owner=None) -> Callable[..., Any]:
        """
        Get descriptor for the decorated function.

        Necessary to support instance/class bound methods.
        """
        if instance is None:
            return self.__call__

        # Bind the instance to the function so that it's received in the `__call__` method
        bound_f = partial(self.__call__, instance)
        return bound_f

    @overload
    def __call__(self, ctx: ActionCtx, *args: Any, **kwargs: Any) -> Any: ...

    @overload
    def __call__(self, *args: Any, **kwargs: Any) -> AnnotatedAction:  # type: ignore
        ...

    def __call__(self, *args, **kwargs) -> Union[AnnotatedAction, Any]:
        from dara.core.interactivity.any_variable import AnyVariable
        from dara.core.internal.registries import static_kwargs_registry

        min_arg_len = 1 if not self.bound_name else 2

        # The decorated function is called within another action context
        if ACTION_CONTEXT.get():
            if len(args) < min_arg_len or not isinstance(args[min_arg_len - 1], ActionCtx):
                raise TypeError(
                    'When calling an @action-decorated function within an @action, the ActionCtx must be passed in explicitly'
                )

            # Call it directly
            # Note: this makes this return a coroutine which must be awaited if self.func was async
            return self.func(*args, **kwargs)

        # We're not in an @action, check that first non-bound arg is not an ActionCtx
        if len(args) >= min_arg_len and isinstance(args[min_arg_len - 1], ActionCtx):
            raise TypeError(
                'When calling an @action-decorated function outside an @action, the ActionCtx must not be passed in explicitly as it will be injected by Dara runtime'
            )

        instance_uid = str(uuid.uuid4())

        all_args = [*args]
        bound_arg = None

        # If the function is bound to a class(instance), pop the bound argument from the args to handle it separately
        if self.bound_name:
            bound_arg = all_args.pop(0)

        # Create kwargs for every argument based on the function signature and then split them into dynamic vs static
        all_kwargs = {**kwargs}
        for idx, param in enumerate(self.new_sig.parameters.values()):
            if idx >= len(all_args):
                if param.name in all_kwargs:
                    continue
                if param.default == inspect.Parameter.empty:
                    raise TypeError(f'Expected positional argument: {param.name} to be passed, but it was not')
                all_kwargs[param.name] = param.default
            else:
                all_kwargs[param.name] = all_args[idx]

        # Verify types are correct
        for key, value in all_kwargs.items():
            if key in self.func.__annotations__:
                valid_value = True
                # The type is either not set or something tricky to verify, e.g. union
                with contextlib.suppress(Exception):
                    valid_value = isinstance(value, (self.func.__annotations__[key], AnyVariable))

                if not valid_value:
                    raise TypeError(
                        f'Argument: {key} was passed as a {type(value)}, but it should be '
                        f'{self.func.__annotations__[key]}, or a Variable instance'
                    )

        # Split args based on whether they are static or dynamic
        dynamic_kwargs: Dict[str, AnyVariable] = {}
        static_kwargs: Dict[str, Any] = {}
        for key, kwarg in all_kwargs.items():
            if isinstance(kwarg, StateVariable):
                raise ValueError(
                    'StateVariable cannot be used as input to actions. '
                    "StateVariables are internal variables for tracking DerivedVariable ephemeral client state shouldn't be used as action payloads."
                )
            if isinstance(kwarg, AnyVariable):
                dynamic_kwargs[key] = kwarg
            else:
                static_kwargs[key] = kwarg

        # If the function is bound to a class(instance), add the bound argument to the static kwargs
        if self.bound_name:
            static_kwargs[BOUND_PREFIX + self.bound_name] = bound_arg

        # Store the static_kwargs in a registry
        static_kwargs_registry.register(instance_uid, static_kwargs)

        # Register the instance
        instance = AnnotatedAction(
            dynamic_kwargs=dynamic_kwargs,
            uid=instance_uid,
            definition_uid=self.definition_uid,  # Link to the definition
        )

        return instance
