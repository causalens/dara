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

import uuid
from enum import Enum
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Iterable,
    List,
    Literal,
    Optional,
    TypeVar,
    Union,
)

from pydantic import BaseModel

from dara.core.base_definitions import ActionDef, ActionInstance, TemplateMarker
from dara.core.interactivity.data_variable import DataVariable
from dara.core.internal.download import generate_download_code
from dara.core.internal.utils import run_user_handler

# Type-only imports
if TYPE_CHECKING:
    from dara.core.interactivity import (
        AnyDataVariable,
        AnyVariable,
        DerivedVariable,
        UrlVariable,
        Variable,
    )

TriggerVariableDef = ActionDef(name='TriggerVariable', js_module='@darajs/core', py_module='dara.core')


class ActionInputs(BaseModel):
    """
    Base class for all action inputs
    """

    class Config:
        extra = 'allow'


class ActionContext(BaseModel):
    """
    Base class for action context
    """

    extras: List[Any] = []
    inputs: ActionInputs


ActionContextType = TypeVar('ActionContextType', bound=ActionContext)


class ComponentActionInputs(ActionInputs):
    value: Any


class ComponentActionContext(ActionContext):
    """
    ActionContext for actions that only require component value
    """

    inputs: ComponentActionInputs


class TriggerVariable(ActionInstance):
    """
    The TriggerVariable action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` and force a recalculation of a
    DerivedVariable

    ```python

    from dara.core import Variable, UpdateVariable, DerivedVariable, TriggerVariable
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara_dashboarding_extension import Stack, Button, Text

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

    js_module = '@darajs/core'

    variable: 'DerivedVariable'
    force: bool = True


NavigateToDef = ActionDef(name='NavigateTo', js_module='@darajs/core', py_module='dara.core')


class NavigateTo(ActionInstance):
    """
    The NavigateTo action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` and will trigger a change in route
    based on the url passed. The url can be a static string, or it can be a function that will be called with the
    element that triggered the action (the structure of this will depend on the component this action is passed to).

    Basic example of how to use `NavigateTo`:

    ```python

    from dara.core import NavigateTo, Variable
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara_dashboarding_extension import Stack, Button, Select

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

    js_module = '@darajs/core'

    new_tab: bool = False
    url: Optional[str]
    extras: Optional[List[Union[AnyVariable, TemplateMarker]]]
    Ctx = ComponentActionContext

    class Config:
        smart_union = True

    def __init__(
        self, url: Union[str, Callable[[Any], str]], new_tab: bool = False, extras: Optional[List[AnyVariable]] = None
    ):
        """
        :param url: the url as a string or function that returns a string
        :param new_tab: whether to open the url in a new tab, defaults to false
        :param extras: extra variables to pass into the url resolver
        """
        uid = str(uuid.uuid4())

        if not isinstance(url, str):
            self.register_resolver(uid, url)

        super().__init__(uid=uid, url=url if isinstance(url, str) else None, new_tab=new_tab, extras=extras)


UpdateVariableDef = ActionDef(name='UpdateVariable', js_module='@darajs/core', py_module='dara.core')


class UpdateVariableInputs(ActionInputs):
    old: Any
    new: Any


class UpdateVariableContext(ActionContext):
    inputs: UpdateVariableInputs


class UpdateVariable(ActionInstance):
    """
    The UpdateVariable action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` and trigger the update of a Variable or UrlVariable.
    The resolver function takes a Context param which will feed the `inputs`: `old` and `new` as well as any `extras` passed through.

    Below an example of how a resolver might look:

    ```python
    from dara.core import Variable, UpdateVariable
    from dara_dashboarding_extension import Button

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
    from dara_dashboarding_extension import Button

    var = Variable(True)

    Button(
        'Toggle',
        onclick=UpdateVariable(variable=var, resolver=lambda ctx: not ctx.inputs.old),
    )
    ```

    Example of using `UpdateVariable` to sync values:

    ```python

    from dara.core import Variable, UpdateVariable
    from dara_dashboarding_extension import Select

    var = Variable('first')

    Select(
        value=Variable('first'),
        items=['first', 'second', 'third'],
        onchange=UpdateVariable(lambda ctx: ctx.inputs.new, var),
    )

    ```
    """

    js_module = '@darajs/core'

    variable: Union[Variable, DataVariable, UrlVariable]
    extras: Optional[List[Union[AnyVariable, TemplateMarker]]]

    Ctx = UpdateVariableContext

    class Config:
        smart_union = True

    def __init__(
        self,
        resolver: Callable[[UpdateVariableContext], Any],
        variable: Union[Variable, DataVariable, UrlVariable],
        extras: Optional[List[Union[AnyVariable, TemplateMarker]]] = None,
    ):
        """
        :param resolver: a function to resolve the new value for the variable.  Takes one arguments: containing a context of type `Updatevariable.Ctx`
        :param variable: the variable or url variable to update with a new value upon triggering the action
        :param extras: any extra variables to resolve and pass to the resolution function context
        """

        uid = str(uuid.uuid4())

        # If target is a DataVariable, wrap the resolver so that it updates the data variable with the result
        # rather than returning it to the browser
        if isinstance(variable, DataVariable):
            from dara.core.internal.registries import (
                data_variable_registry,
                utils_registry,
            )

            var_entry = data_variable_registry.get(str(variable.uid))
            store = utils_registry.get('Store')

            async def data_resolver(ctx):
                resolved_value = await run_user_handler(resolver, (ctx,))
                DataVariable.update_value(var_entry, store, resolved_value)

            self.register_resolver(uid, data_resolver)
        else:
            self.register_resolver(uid, resolver)

        super().__init__(uid=uid, variable=variable, extras=extras)


ResetVariablesDef = ActionDef(name='ResetVariables', js_module='@darajs/core', py_module='dara.core')


class ResetVariables(ActionInstance):
    """
    The ResetVariables action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` in order to reset a number of variables to their
    default values

    Basic example of resetting a Variable:

    ```python

    from dara.core import Variable, ResetVariables, UpdateVariable
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara_dashboarding_extension import Stack, Button, Text

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

    js_module = '@darajs/core'

    variables: List[AnyVariable]


SideEffectDef = ActionDef(name='SideEffect', js_module='@darajs/core', py_module='dara.core')


class SideEffect(ActionInstance):
    """
    The SideEffect action can be passed to any `ComponentInstance` prop accepting an `ActionInstance` in order to trigger an arbitrary python function

    Example of how to get values from context in `SideEffect` function:

    ```python

    from dara.core import Variable, SideEffect
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara_dashboarding_extension import Stack, Select

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

    js_module = '@darajs/core'

    function: Callable
    extras: Optional[List[Union[AnyVariable, TemplateMarker]]]
    block: bool = False

    Ctx = ComponentActionContext

    class Config:
        smart_union = True

    def __init__(
        self,
        function: Callable[[ComponentActionContext], Any],
        extras: Optional[List[Union[AnyVariable, TemplateMarker]]] = None,
        block: bool = False,
    ):
        """
        The SideEffect action can be passed to any callback on a component in order to trigger an arbitrary python function

        :param function: the function to be triggered; Note that the function takes a context of type `SideEffect.Ctx`.
            The extras can be found as a list under `SideEffect.Ctx.extras`
            And the value of the component that triggered the action: `SideEffect.Ctx.inputs.value`
        :param extras: extra variables to pass into the resolver
        :param block: whether the side effect execution should block the execution of the chain of actions it is included in;
            when `False`, the side effect is ran as a 'fire and forget' effect, otherwise Dara will wait for its completion
            before running the next action in chain
        """
        uid = str(uuid.uuid4())

        self.register_resolver(uid, function)

        super().__init__(uid=uid, function=function, extras=extras, block=block)


DownloadVariableDef = ActionDef(name='DownloadVariable', js_module='@darajs/core', py_module='dara.core')

DownloadVariableValueType = Union[Iterable[Iterable], Iterable[dict]]


class DownloadVariable(ActionInstance):
    """
    Download action, downloads a given variable as a file.

    Note that as of now variables ran as a task are not supported.

    ```python

    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.core import DownloadVariable, Variable
    from dara_dashboarding_extension import Stack, Button

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

    js_module = '@darajs/core'

    variable: Union[
        Variable[DownloadVariableValueType],
        DerivedVariable[DownloadVariableValueType],
        AnyDataVariable,
    ]
    file_name: Optional[str] = None
    type: Union[Literal['csv'], Literal['xlsx'], Literal['json']] = 'csv'


DownloadContentDef = ActionDef(name='DownloadContent', js_module='@darajs/core', py_module='dara.core')


class DownloadContent(ActionInstance):
    """
    Download action, downloads a given file

    ```python

    from dara.core.configuration import ConfigurationBuilder
    from dara.core.interactivity.actions import DownloadContent
    from dara_dashboarding_extension.components import Button, Stack
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

    js_module = '@darajs/core'

    extras: Optional[List[Union[AnyVariable, TemplateMarker]]]
    cleanup_file: Optional[bool]
    Ctx = ComponentActionContext

    class Config:
        smart_union = True

    def __init__(
        self,
        resolver: Callable[[ComponentActionContext], str],
        extras: Optional[List[AnyVariable]] = None,
        cleanup_file: bool = False,
    ):
        """
        :param resolver: a function to resolve the path for the file which will be downloaded.
            Note that the function takes one argument which is the action context `DownloadContent.Ctx` where the resolved extra values passed can be obtained
        :param cleanup_file: whether to delete the file from the given path after user has downloaded it.
        :param extras: any extra variables to resolve and pass to the resolution function.
        """
        uid = str(uuid.uuid4())

        from dara.core.internal.registries import action_registry

        async def download_file_code(ctx: ComponentActionContext):
            resolved_path = await run_user_handler(resolver, (ctx,))
            return generate_download_code(resolved_path, cleanup_file)

        action_registry.register(uid, download_file_code)

        super().__init__(uid=uid, extras=extras)


NotifyDef = ActionDef(name='Notify', js_module='@darajs/core', py_module='dara.core')


class NotificationStatus(Enum):
    CANCELED = 'CANCELED'
    CREATED = 'CREATED'
    ERROR = 'ERROR'
    FAILED = 'FAILED'
    NONE = ''
    QUEUED = 'QUEUED'
    RUNNING = 'RUNNING'
    SUCCESS = 'SUCCESS'
    WARNING = 'WARNING'


class Notify(ActionInstance):
    """
    Notify action, this triggers the UI to create a notification which is presented to the user, with a title and message.

    ```python

    from dara.core.interactivity.actions import Notify, NotificationStatus
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon

    from dara_dashboarding_extension import Stack, Button

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

    js_module = '@darajs/core'

    key: str
    message: str
    status: NotificationStatus
    title: str

    Status = NotificationStatus

    def __init__(self, message: str, title: str, status: NotificationStatus, key: Optional[str] = None):
        """
        :param message: Main message of the notification
        :param title: Title of the notification
        :param status: The status type of the notification, this affects the colour
        :param key: The key of the notification, this is used to prevent multiple of the same notifications appearing.
        """
        _key = key if key is not None else title
        super().__init__(key=_key, message=message, title=title, status=status)


LogoutDef = ActionDef(name='Logout', js_module='@darajs/core', py_module='dara.core')


class Logout(ActionInstance):
    """
    Logout action, this triggers the UI to logout the user

    Example of adding Logout action to a button:

    ```python

    from dara.core.interactivity.actions import Logout
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.css import get_icon
    from dara.core.auth import BasicAuthConfig

    from dara_dashboarding_extension import Stack, Button

    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig(username='test', password='test'))


    def test_page():
        return Stack(Button('Logout', onclick=Logout()))


    config.add_page(name='Logout Page', content=test_page(), icon=get_icon('paper-plane'))

    ```
    """

    js_module = '@darajs/core'
