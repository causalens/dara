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
from contextvars import ContextVar
import inspect

import uuid
from enum import Enum
from typing import (
    TYPE_CHECKING,
    Any,
    Awaitable,
    Callable,
    ClassVar,
    Dict,
    Iterable,
    List,
    Literal,
    Optional,
    Type,
    TypeVar,
    Union,
    overload
)
from typing_extensions import ParamSpec, Concatenate, deprecated
from functools import update_wrapper, wraps
import anyio
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from pandas import DataFrame

from pydantic import BaseModel

from dara.core.base_definitions import ActionDef, ActionImpl, ActionResolverDef, DaraBaseModel, TemplateMarker

from dara.core.interactivity.data_variable import DataVariable
from dara.core.internal.download import generate_download_code
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.utils import run_user_handler

# Type-only imports
if TYPE_CHECKING:
    from dara.core.base_definitions import AnnotatedAction
    from dara.core.interactivity import (
        AnyDataVariable,
        AnyVariable,
        DerivedVariable,
        UrlVariable,
        Variable,
    )
    from dara.core.internal.cache_store import CacheStore


class ActionInputs(BaseModel):
    """
    Base class for all action inputs
    """

    class Config:
        extra = 'allow'


@deprecated('Used in deprecated action wrappers')
class ActionContext(BaseModel):
    """
    Base class for action context
    """

    extras: List[Any] = []
    inputs: ActionInputs



class ComponentActionInputs(ActionInputs):
    value: Any


class ComponentActionContext(ActionContext):
    """
    ActionContext for actions that only require component value
    """

    inputs: ComponentActionInputs


class UpdateVariableImpl(ActionImpl):
    """
    UpdateVariable action implementation.

    {
        "type": "UpdateVariable",
        "target": ...var...,
        "value": ...value...
    }
    """
    py_name = 'UpdateVariable'

    target: Union[Variable, UrlVariable, DataVariable]
    value: Any

    async def execute(self, ctx: ActionCtx) -> Any:
        if isinstance(self.target, DataVariable):
            # Update on the backend
            from dara.core.internal.registries import (
                data_variable_registry,
                utils_registry,
            )

            store: CacheStore = utils_registry.get('Store')
            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

            var_entry = await registry_mgr.get(data_variable_registry, self.target.uid)
            DataVariable.update_value(var_entry, store, self.value)
            # Don't notify frontend explicitly, all clients will be notified by update_value above
            return None


        # for non-data variables just ping frontend with the new value
        return await super().execute(ctx)


UpdateVariableDef = ActionDef(name='UpdateVariable', js_module='@darajs/core', py_module='dara.core')


class UpdateVariableInputs(ActionInputs):
    old: Any
    new: Any


class UpdateVariableContext(ActionContext):
    inputs: UpdateVariableInputs


@deprecated('Use @action or `UpdateVariableImpl` for simple cases')
def UpdateVariable(resolver: Callable[[UpdateVariableContext], Any], variable: Union[Variable, DataVariable, UrlVariable], extras: Optional[List[Union[AnyVariable, TemplateMarker]]] = None) -> AnnotatedAction:
    """
    @deprecated: Passing in resolvers is deprecated, use `ctx.update` in an `@action` or `UpdateVariableImpl` instead.
    `UpdateVariableImpl` will be renamed to `UpdateVariable` in Dara 2.0.

    The UpdateVariable action can be passed to any `ComponentInstance` prop accepting an action and trigger the update of a Variable, UrlVariable or DataVariable.
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
    async def _update(ctx: action.ctx, **kwargs):
        old = kwargs.pop('old')
        extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
        old_ctx = UpdateVariableContext(inputs=UpdateVariableInputs(
            old=old,
            new=ctx.input
        ), extras=extras)
        result = await run_user_handler(resolver, args=(old_ctx, ))
        await ctx.update(variable, result)

    # Update the signature of _update to match so @action decorator works
    params = [
        inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.ctx),
        inspect.Parameter('old', inspect.Parameter.POSITIONAL_OR_KEYWORD),
        *[
            inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
            for idx in range(len(extras or []))
        ]
    ]
    _update.__signature__ = inspect.Signature(params)

    # Pass in variable and extras as kwargs
    kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}
    kwargs['old'] = variable

    return action(_update)(**kwargs)

UpdateVariable.Ctx = UpdateVariableContext


TriggerVariableDef = ActionDef(name='TriggerVariable', js_module='@darajs/core', py_module='dara.core')


class TriggerVariable(ActionImpl):
    """
    The TriggerVariable action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` and force a recalculation of a
    DerivedVariable

    ```python

    from dara.core import Variable, UpdateVariable, DerivedVariable, TriggerVariable
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.components import Stack, Button, Text

    config = ConfigurationBuilder()

    var1 = Variable(1)
    var2 = Variable(2)
    der_var = DerivedVariable(lambda x, y: x + y, variables=[var1, var2], deps=[var2])


    def test_page():
        return Stack(
            # When clicking this button der_var syncs and calculates latest sum value
            Button('Trigger der_var', onclick=TriggerVariable(variable=der_var)),

            # Because var1 is not a deps of der_var changing its value does not trigger an update
            Button('Add 1 to var1', onclick=UpdateVariable(variable=var1, resolver=lambda ctx: ctx.inputs.old + 1)),

            Stack(Text('der_var: '), Text(der_var), direction='horizontal'),
            Stack(Text('var1: '), Text(var1), direction='horizontal'),
            Stack(Text('var2: '), Text(var2), direction='horizontal'),
        )


    config.add_page(name='Trigger Variable', content=test_page(), icon=get_icon('dove'))

    ```
    """
    variable: DerivedVariable
    force: bool = True



NavigateToDef = ActionDef(name='NavigateTo', js_module='@darajs/core', py_module='dara.core')

class NavigateToImpl(ActionImpl):
    py_name = 'NavigateTo'

    url: Optional[str]
    new_tab: bool

@deprecated('Use @action or `NavigateToImpl` for simple cases')
def NavigateTo(url: Union[str, Callable[[Any], str]], new_tab: bool = False, extras: Optional[List[AnyVariable]] = None):
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

    async def _navigate(ctx: action.ctx, **kwargs):
        extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
        old_ctx = ComponentActionContext(
            inputs=ComponentActionInputs(value=ctx.input),
            extras=extras
        )
        result = await run_user_handler(url, args=(old_ctx, ))
        # Navigate to resulting url
        await ctx.navigate(result, new_tab)

    # Update the signature of _navigate to match so @action decorator works
    params = [
        inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.ctx),
        *[
            inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
            for idx in range(len(extras or []))
        ]
    ]
    _navigate.__signature__ = inspect.Signature(params)

    # Pass in variable and extras as kwargs
    kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}
    return action(_navigate)(**kwargs)


NavigateTo.Ctx = ComponentActionContext


def Logout():
    """
    Logout action, this triggers the UI to logout the user

    Example of adding Logout action to a button:

    ```python

    from dara.core.interactivity.actions import Logout
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.core.auth import BasicAuthConfig

    from dara.components import Stack, Button

    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig(username='test', password='test'))


    def test_page():
        return Stack(Button('Logout', onclick=Logout()))


    config.add_page(name='Logout Page', content=test_page(), icon=get_icon('paper-plane'))

    ```
    """
    return NavigateToImpl(url='/logout', new_tab=False)



ResetVariablesDef = ActionDef(name='ResetVariables', js_module='@darajs/core', py_module='dara.core')


class ResetVariables(ActionImpl):
    """
    The ResetVariables action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` in order to reset a number of variables to their
    default values

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



NotifyDef = ActionDef(name='Notify', js_module='@darajs/core', py_module='dara.core')


class Notify(ActionImpl):
    """
    Notify action, this triggers the UI to create a notification which is presented to the user, with a title and message.

    ```python

    from dara.core.interactivity.actions import Notify, NotificationStatus
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon

    from dara.components import Stack, Button

    config = ConfigurationBuilder()


    def test_page():
        return Stack(
            Button(
                'Notify',
                onclick=Notify(
                    message='This is the notification message', title='Example', status=NotificationStatus.SUCCESS
                ),
            )
        )


    config.add_page(name='Notify Example', content=test_page(), icon=get_icon('bell'))

    ```
    """
    key: Optional[str] = None
    message: str
    status: NotificationStatus
    title: str

    Status = NotificationStatus


class DownloadContentImpl(ActionImpl):
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

    from dara.core.configuration import ConfigurationBuilder
    from dara.core.interactivity.actions import DownloadContent
    from dara.components.components import Button, Stack
    from dara.core.definitions import ComponentInstance
    from dara.core.interactivity import DataVariable
    from dara.core.css import get_icon


    # generate data, alternatively you could load it from a file
    df = pandas.DataFrame(data={'x': [1, 2, 3], 'y':[4, 5, 6]})
    my_var = DataVariable(df)

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


    def test_page() -> ComponentInstance:
        return Stack(
            Button(
                'Download File', onclick=DownloadContent(resolver=return_csv, extras=[my_var], cleanup_file=False)
            ),
        )


    config.add_page(name='Download Content', content=test_page, icon=get_icon('file-arrow-down'))

    ```
    """
    async def _download(ctx: action.ctx, **kwargs):
        extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
        old_ctx = ComponentActionContext(
            inputs=ComponentActionInputs(value=ctx.input),
            extras=extras
        )
        result = await run_user_handler(resolver, args=(old_ctx, ))
        await ctx.download_file(result, cleanup_file)

    # Update the signature of _download to match so @action decorator works
    params = [
        inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.ctx),
        *[
            inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
            for idx in range(len(extras or []))
        ]
    ]
    _download.__signature__ = inspect.Signature(params)

    # Pass in extras as kwargs
    kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}

    return action(_download)(**kwargs)


DownloadVariableDef = ActionDef(name='DownloadVariable', js_module='@darajs/core', py_module='dara.core')


class DownloadVariable(ActionImpl):
    """
    Download action, downloads the content of a given variable as a file.

    Note that as of now variables ran as a task are not supported.

    ```python

    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.core import DownloadVariable, Variable
    from dara.components import Stack, Button

    config = ConfigurationBuilder()

    my_var = Variable('example')


    def test_page():
        return Stack(
            Button(
                'Download Variable',
                onclick=DownloadVariable(variable=my_var, file_name='test_file', type='json'),
            )
        )


    config.add_page(name='Download Variable', content=test_page(), icon=get_icon('download'))

    ```
    """
    variable: Union[Variable, DerivedVariable, AnyDataVariable]
    file_name: Optional[str] = None
    type: Union[Literal['csv'], Literal['xlsx'], Literal['json']] = 'csv'



@deprecated('Use @action instead')
def SideEffect(function: Callable[[ComponentActionContext], Any], extras: Optional[List[Union[AnyVariable, TemplateMarker]]] = None, block: bool = False):
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
    async def _effect(ctx: action.ctx, **kwargs):
        extras = [kwargs[f'kwarg_{idx}'] for idx in range(len(kwargs))]
        old_ctx = ComponentActionContext(
            inputs=ComponentActionInputs(value=ctx.input),
            extras=extras
        )
        # Simply run the user handler
        await run_user_handler(function, args=(old_ctx, ))

    # Update the signature of _effect to match so @action decorator works
    params = [
        inspect.Parameter('ctx', inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=action.ctx),
        *[
            inspect.Parameter(f'kwarg_{idx}', inspect.Parameter.POSITIONAL_OR_KEYWORD)
            for idx in range(len(extras or []))
        ]
    ]
    _effect.__signature__ = inspect.Signature(params)

    # Pass in extras as kwargs
    kwargs = {f'kwarg_{idx}': value for idx, value in enumerate(extras or [])}

    return action(_effect)(**kwargs)

SideEffect.Ctx = ComponentActionContext

VariableT = TypeVar('VariableT')

class ActionCtx:
    """
    Action execution context.
    """
    _action_send_stream: MemoryObjectSendStream[ActionImpl]
    _action_receive_stream: MemoryObjectReceiveStream[ActionImpl]
    _on_action: Callable[[Optional[ActionImpl]], Awaitable]

    input: Any

    def __init__(self, _input: Any, _on_action: Callable[[Optional[ActionImpl]], Awaitable]):
        self.input= _input
        self._action_send_stream, self._action_receive_stream = anyio.create_memory_object_stream(item_type=ActionImpl, max_buffer_size=0)
        self._on_action = _on_action

    @overload
    async def update(self, target: DataVariable, value: Optional[DataFrame]): ...

    @overload
    async def update(self, target: Union[Variable[VariableT], UrlVariable[VariableT]], value: VariableT): ...

    async def update(self, target: Union[Variable, UrlVariable, DataVariable], value: Any):
        """
        Update a given variable to provided value

        :param target: the variable to update
        :param value: the new value for the variable
        """
        return await UpdateVariableImpl(target=target, value=value).execute(self)

    async def trigger(self, variable: DerivedVariable, force: bool = True):
        """
        Trigger a given DerivedVariable to recalculate

        :param variable: the variable to trigger
        :param force: whether to force the recalculation, defaults to True
        """
        return await TriggerVariable(variable=variable, force=force).execute(self)

    async def navigate(self, url: str, new_tab: bool = False):
        """
        Navigate to a given url

        :param url: the url to navigate to
        :param new_tab: whether to open the url in a new tab, defaults to False
        """
        return await NavigateToImpl(url=url, new_tab=new_tab).execute(self)

    async def logout(self):
        """
        Logout the current user.
        """
        return await Logout().execute(self)

    async def notify(self, message: str, title: str, status: NotificationStatus, key: Optional[str] = None):
        """
        Display a notification on the frontend

        :param message: the message to display
        :param title: the title of the notification
        :param status: the status of the notification
        :param key: optional key for the notification
        """
        return await Notify(key=key, message=message, status=status, title=title).execute(self)

    async def reset_variables(self, variables: Union[List[AnyVariable], AnyVariable]):
        """
        Reset a list of variables to their default values

        :param variables: a variable or list of variables to reset
        """
        variables = [variables] if not isinstance(variables, list) else variables
        return await ResetVariables(variables=variables).execute(self)

    async def download_file(self, path: str, cleanup: bool = False):
        """
        Download a given file.

        :param path: the path to the file to download
        :param cleanup: whether to delete the file after download
        """
        code = await generate_download_code(path, cleanup)
        return await NavigateToImpl(url=f'/api/core/download?code={code}', new_tab=True).execute(self)

    async def download_variable(self, variable: Union[Variable, DerivedVariable, AnyDataVariable], file_name: Optional[str] = None, type: Union[Literal['csv'], Literal['xlsx'], Literal['json']] = 'csv'):
        """
        Download the content of a given variable as a file.
        Note that the content of the file must be valid for the given type.

        :param variable: the variable to download
        :param file_name: optional name of the file to download
        :param type: the type of the file to download, defaults to csv
        """
        return await DownloadVariable(variable=variable, file_name=file_name, type=type).execute(self)

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

P = ParamSpec('P')

class action:
    """
    A decorator for creating actions. Actions are used to trigger changes in the UI, such as updating a variable, navigating to a new page, etc.

    The decorator injects an `ActionCtx` object as the first argument to the decorated function, which can be used to access the available
    actions as well as the input value of the component that triggered the action.

    An @action-decorated function can be called with a list of Variable and non-Variable arguments. The non-Variable arguments will be passed
    as-is to the decorated function, while the Variable arguments will be passed as the current value of the Variable.
    """

    ctx: Type[ActionCtx] = ActionCtx

    def __init__(self, func: Callable[Concatenate[ActionCtx, P], Any]):
        from dara.core.internal.execute_action import execute_action
        from dara.core.internal.registries import action_registry

        self.func = func
        self.definition_uid = str(uuid.uuid4())

        # Register the definition
        act_def = ActionResolverDef(resolver=func, uid=self.definition_uid, execute_action=execute_action)
        action_registry.register(self.definition_uid, act_def)

        # Modify the function signature
        signature = inspect.signature(func)
        new_params = list(signature.parameters.values())
        new_params.pop(0)  # Remove the first parameter (ctx)
        self.new_sig = signature.replace(parameters=new_params)

        # Update the function's __signature__ attribute for correct introspection
        update_wrapper(self, func)  # This transfers attributes like __name__, __doc__, etc.
        self.__signature__ = self.new_sig  # type: ignore

    def __call__(self, *args, **kwargs) -> AnnotatedAction:
        from dara.core.base_definitions import AnnotatedAction
        from dara.core.interactivity.any_variable import AnyVariable
        from dara.core.internal.registries import static_kwargs_registry

        instance_uid = str(uuid.uuid4())

        # Create kwargs for every argument based on the function signature and then split them into dynamic vs static
        all_kwargs = {**kwargs}
        for idx, param in enumerate(self.new_sig.parameters.values()):
            if idx >= len(args):
                if param.name in all_kwargs:
                    continue
                if param.default == inspect.Parameter.empty:
                    raise TypeError(f'Expected positional argument: {param.name} to be passed, but it was not')
                all_kwargs[param.name] = param.default
            else:
                all_kwargs[param.name] = args[idx]

        # Verify types are correct
        for key, value in all_kwargs.items():
            if key in self.func.__annotations__:
                valid_value = True
                try:
                    valid_value = isinstance(value, (self.func.__annotations__[key], AnyVariable))
                except Exception:
                    pass  # The type is either not set or something tricky to verify, e.g. union
                if not valid_value:
                    raise TypeError(
                        f'Argument: {key} was passed as a {type(value)}, but it should be '
                        f'{self.func.__annotations__[key]}, or a Variable instance'
                    )

        # Split args based on whether they are static or dynamic
        dynamic_kwargs: Dict[str, AnyVariable] = {}
        static_kwargs: Dict[str, Any] = {}
        for key, kwarg in all_kwargs.items():
            if isinstance(kwarg, AnyVariable):
                dynamic_kwargs[key] = kwarg
            else:
                static_kwargs[key] = kwarg

        # Store the static_kwargs in a registry
        static_kwargs_registry.register(instance_uid, static_kwargs)

        # Register the instance
        instance = AnnotatedAction(
            dynamic_kwargs=dynamic_kwargs,
            uid=instance_uid,
            definition_uid=self.definition_uid  # Link to the definition
        )

        return instance
