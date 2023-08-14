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

import os
import pathlib
import shutil
from types import ModuleType
from typing import Any, Callable, Dict, List, Literal, Optional, Set, Tuple, Type, Union

from pydantic.generics import GenericModel

from dara.core.auth.base import BaseAuthConfig
from dara.core.auth.basic import DefaultAuthConfig
from dara.core.base_definitions import ActionDef, ActionInstance
from dara.core.definitions import (
    AnyVariable,
    ApiRoute,
    CallableClassComponent,
    ComponentInstance,
    ComponentInstanceType,
    ComponentTypeAnnotation,
    EndpointConfiguration,
    JsComponentDef,
    Page,
    Template,
)
from dara.core.internal.import_discovery import (
    create_action_definition,
    create_component_definition,
    run_discovery,
)
from dara.core.internal.scheduler import ScheduledJob, ScheduledJobFactory
from dara.core.logging import dev_logger
from dara.core.visual.components import RawString
from dara.core.visual.themes import BaseTheme, ThemeDef


class Configuration(GenericModel):
    """Definition of the main framework configuration"""

    auth_config: BaseAuthConfig
    actions: List[ActionDef]
    endpoint_configurations: List[EndpointConfiguration]
    components: List[ComponentTypeAnnotation]
    context_components: List[ComponentInstance]
    enable_devtools: bool
    js_module_name: Optional[Tuple[str, str, str]]
    live_reload: bool
    pages: Dict[str, Page]
    routes: Set[ApiRoute]
    scheduled_jobs: List[Tuple[Union[ScheduledJob, ScheduledJobFactory], Callable, Optional[List[Any]]]] = []
    startup_functions: List[Callable]
    static_folders: List[str]
    static_files_dir: str
    package_tag_processors: List[Callable[[Dict[str, List[str]]], Dict[str, List[str]]]]
    template_extra_js: str
    task_module: Optional[str]
    template: str
    template_renderers: Dict[str, Callable[..., Template]]
    theme: Union[BaseTheme, str]
    title: str
    ws_handlers: Dict[str, Callable[[str, Any], Any]]

    class Config:
        extra = 'forbid'

    def get_package_map(self) -> Dict[str, str]:
        """
        Get a map of python package names to js package names, based on currently
        registered components, actions etc.
        """
        packages = {
            'dara.core': '@darajs/core',
        }

        # Discover py modules with js modules to pull in
        for comp_def in self.components:
            if isinstance(comp_def, JsComponentDef) and comp_def.js_module is not None:
                packages[comp_def.py_module] = comp_def.js_module

        for act_def in self.actions:
            if act_def.js_module is not None:
                packages[act_def.py_module] = act_def.js_module

        # Handle auth components
        for comp in self.auth_config.component_config.dict().values():
            packages[comp['py_module']] = comp['js_module']

        return packages


class ConfigurationBuilder:
    """
    The ConfigurationBuilder class lets you build a Configuration object up piece by piece using helper methods that
    aid setup and point users in the right direction.
    """

    auth_config: BaseAuthConfig
    _actions: List[ActionDef]
    _components: List[ComponentTypeAnnotation]
    _errors: List[str]
    enable_devtools: bool
    js_module_name: Optional[Tuple[str, str, str]]
    """
    Optional local js_module to include - tuple of (py_module, js_module, version)

    config.js_module_name = ('py_module_name', 'js_module_name', 0.0.1)
    # or
    config.js_module_name = ('py_module_name', 'js_module_name', version('py_module_name'))
    """

    live_reload: bool
    _pages: Dict[str, Page]
    _template_renderers: Dict[str, Callable[..., Template]]
    _endpoint_configurations: List[EndpointConfiguration]
    _static_folders: List[str]
    _package_tags_processors: List[Callable[[Dict[str, List[str]]], Dict[str, List[str]]]]
    _template_extra_js: str
    _custom_ws_handlers: Dict[str, Callable[[str, Any], Any]]
    routes: Set[ApiRoute]
    static_files_dir: str
    scheduled_jobs: List[Tuple[Union[ScheduledJob, ScheduledJobFactory], Callable, Optional[List[Any]]]] = []
    startup_functions: List[Callable]
    context_components: List[ComponentInstance]
    task_module: Optional[str]
    template: str
    theme: BaseTheme
    title: str

    def __init__(self):
        self.auth_config = DefaultAuthConfig()
        self._actions = []
        self._components = []
        self._errors = []
        self.enable_devtools = False
        self.js_module_name = None
        self.live_reload = False
        self._package_tags_processors = []
        self._template_extra_js = ''
        self._pages = {}
        self._template_renderers = {}
        self._endpoint_configurations = []
        self.routes = set()
        self.static_files_dir = os.path.join(pathlib.Path().parent.parent.absolute(), 'dist')
        self._static_folders = []

        self.scheduled_jobs = []
        self.startup_functions = []
        self.context_components = []
        self.task_module = None
        self._custom_ws_handlers = {}

        self.template = 'default'
        self.theme = BaseTheme(main='light')
        self.title = 'decisionApp'

    def add_action(self, action: Type[ActionInstance], local: bool = False):
        """
        Register an Action with the application.

        For example the below would explicitly import the UpdateVariable action from dara.core.

        `add_action(UpdateVariable)`

        Note that in most cases explicitly registering a action is not necessary in most cases
        for non-local actionts. Actions are auto-discovered based on imports within your application.

        :param action: ActionInstance-subclass definition
        :param local: whether the action is a local one.
        For local actions js_module is not required, as their location is defined via dara.config.json
        """
        act_def = create_action_definition(action, local)
        self._actions.append(act_def)
        return act_def

    def add_endpoint(self, endpoint: ApiRoute):
        """
        Register an API endpoint in the application
        """
        self.routes.add(endpoint)
        return endpoint

    def add_context_component(self, component: ComponentInstance):
        """
        Add a ContextComponent to the application.

        Context components are rendered recursively in order around the application. E.g.

        ```
        config.add_context_component(Component1)
        config.add_context_component(Component2)

        # Results in
        <Component1>
            <Component2>
                <Page>
            </Component2>
        </Component1>
        ```

        This can be used by packages outside of core to provide global functionality to components on the page
        and hook into other application contexts, e.g. the router.

        :param component: component instance
        """
        self.context_components.append(component)
        self.add_component(component.__class__)

    def add_component(self, component: Type[ComponentInstance], local: bool = False):
        """
        Register a Component with the application.

        For example the below would import the Menu component from dara.core.

        `add_component(Menu)`

        Note that in most cases explicitly registering a component is not necessary in most cases
        for non-local components. Components are auto-discovered based on imports within your application.

        :param component: ComponentInstance-subclass definition
        :param local: whether the component is a local one.
        For local components js_module is not required, as their location is defined via dara.config.json
        """
        component_def = create_component_definition(component, local)

        self._components.append(component_def)

        # Add the required route
        for route in component.required_routes:
            self.routes.add(route)

        return component_def

    def add_configuration(self, config: EndpointConfiguration):
        """
        Register an EndpointConfiguration instance with the application.
        """
        # Check if there is already one of this class
        for conf in self._endpoint_configurations:
            if config.__class__ == conf.__class__:
                dev_logger.warning(
                    f'Endpoint configuration for class {config.__class__.__name__} already exists, replacing previous configuration instance with the new one'
                )
                self._endpoint_configurations.remove(conf)

        self._endpoint_configurations.append(config)
        return config

    def add_static_folder(self, path: str):
        """
        Register a static folder, its contents can be then addressed with /static/{asset} URLs.

        Its contents will be moved into the local 'static' folder to be served when:
        - running the app locally
        - running the build script
        """
        self._static_folders.append(path)
        return path

    def add_ws_handler(self, kind: str, handler: Callable[[str, Any], Any]):
        """
        Register a custom websocket handler, which will be called when a message of a given kind is received.

        Example:

        ```python
        # Received message
        {
            "type": "custom",
            "message": {
                "kind": "my_custom_kind",
                "data": "some arbitrary data"
            }
        }

        # Handler
        config.add_ws_handler(kind='my_custom_kind', handler=my_custom_handler)

        def my_custom_handler(channel: str, data: Any):
            print(f'Received message on channel {channel} with data {data}')
            return 'some response'

        # Message sent back
        {
            "type": "custom",
            "message": {
                "kind": "my_custom_kind",
                "data": "some response"
            }
        }
        ```
        """
        self._custom_ws_handlers[kind] = handler
        return handler

    def _migrate_static_data(self):
        """
        Migrate data from registered static folders into local ./static folder.
        """
        if len(self._static_folders) == 0:
            return

        local_assets_folder = './static'
        os.makedirs(local_assets_folder, exist_ok=True)

        # For each static folder registered
        for static_folder in self._static_folders:
            if not os.path.isdir(static_folder):
                dev_logger.warning(f'Provided static folder {static_folder} does not exist')
                continue

            names = os.listdir(static_folder)

            # For each file or directory in the static folder provided
            for name in names:
                file_or_dir_path = os.path.join(static_folder, name)
                target_path = os.path.join(local_assets_folder, name)

                # Copy the whole tree if it's a directory
                if os.path.isdir(file_or_dir_path):
                    shutil.copytree(file_or_dir_path, target_path, dirs_exist_ok=True)
                else:
                    # Otherwise copy file if doesn't already exist
                    if not os.path.exists(os.path.join(local_assets_folder, name)):
                        shutil.copy(file_or_dir_path, local_assets_folder)

    def add_package_tags_processor(self, processor: Callable[[Dict[str, List[str]]], Dict[str, List[str]]]):
        """
        Append a package tag processor. This is a function that takes a dictionary of package names to lists of script/link tags included
        when running in the UMD mode.

        All processors are called in order, and the output of each processor is passed to the next one.
        """
        self._package_tags_processors.append(processor)

    def add_page(
        self,
        name: str,
        content: Union[ComponentInstanceType, Type[CallableClassComponent], str],
        icon: Optional[str] = None,
        route: Optional[str] = None,
        include_in_menu: Optional[bool] = True,
        reset_vars_on_load: Optional[List[AnyVariable]] = [],
    ):
        """
        Add a new page to the layout of the platform. Switching between pages relies on the template implementing a
        router for switching between the pages. The default template will do this automatically, but refer to the
        template documentation for more details on this.

        :param name: the name of the page
        :param content: the content for the page
        :param icon: an optional icon for the page, see dara_core.css.get_icon for more detail
        :param route: an optional url for the page, if not provided it's generated based on the page name
        :param include_in_menu: an optional flag for not including the page in the main menu
        :param reset_vars_on_load: optional list of variables to reset upon visiting the page
        """
        url_safe_name = route if route is not None else name.lower().replace(' ', '-').strip()
        if isinstance(content, str):
            content = RawString(content=content)

        # Type provided
        if isinstance(content, type):
            # This checks if the class implements the protocol correctly, i.e. has a `__call__` instance method
            if not issubclass(content, CallableClassComponent):
                raise ValueError(
                    f'add_page received an invalid class object {content}. Please provide a component, function, callable class or its instance'
                )
            # content is a class type which implements the CallableClassComponent protocol
            content = content()

        page = Page(
            icon=icon,
            content=content,
            name=name,
            url_safe_name=url_safe_name,
            include_in_menu=include_in_menu,
            reset_vars_on_load=reset_vars_on_load,
        )
        self._pages[name] = page
        return page

    def add_template_renderer(self, name: str, template_renderer: Callable[..., Template]) -> str:
        """
        Add a new template renderer that can be selected by name as part of the configuration. By default calling this
        function will update the template name to match automatically

        :param name: the template name
        :param template_renderer: the ComponentInstance to use for the template
        """
        self._template_renderers[name] = template_renderer
        self.template = name
        return name

    def add_auth(self, auth: BaseAuthConfig):
        self.auth_config = auth

        return auth

    def set_theme(
        self,
        main_theme: Optional[Union[ThemeDef, Literal['light'], Literal['dark']]] = None,
        base_theme: Optional[Union[Literal['light'], Literal['dark']]] = None,
    ):
        """
        Sets the color theme of the app. Takes ThemeDef models for the app, and reverts
        to the default themes if they are not supplied.

        :param main_theme: ThemeDef defining colors for the app, alternatively can be either 'light' or 'dark' to use default Dara colors
        """
        if isinstance(main_theme, str):
            if main_theme in ('dark', 'light'):
                self.theme.main = main_theme
                return
            raise ValueError(f'Got string for main_theme: {main_theme}. Must be equal to "dark" or "light"')

        self.theme = BaseTheme(
            main=main_theme if main_theme is not None else self.theme.main,
            base=base_theme if base_theme is not None else self.theme.base,
        )

    def on_startup(self, startup_function: Callable):
        """
        Adds a function to be run upon startup of a Dara app

        :param startup_function: The function to be run
        """
        self.startup_functions.append(startup_function)

    def scheduler(self, job: ScheduledJob, args: Union[None, List[Any]] = None):
        if args is None:
            args = []

        def _wrapper_func(func: Callable):
            self.scheduled_jobs.append((job, func, args))

        return _wrapper_func

    def _run_discovery(self, module: Union[ModuleType, dict]):
        """
        Run import discovery in a given module, adding actions and components found to the config

        :param module: module or a dict of global symbols to discover components from
        """
        components, actions = run_discovery(module)

        for comp_type in components:
            # Don't auto register local components - without js_module
            if comp_type.js_module is not None:
                self.add_component(comp_type)

        for act_type in actions:
            # Don't auto register local actions - without js_module
            if act_type.js_module is not None:
                self.add_action(act_type)

    def _to_configuration(self):
        """
        Convert the ConfigurationBuilder to a Configuration class ready for the application to work from.
        """

        if len(self._errors) > 0:
            raise ValueError('This configuration has errors: \n' + '\n'.join(self._errors))

        self._migrate_static_data()

        return Configuration(
            actions=self._actions,
            auth_config=self.auth_config,
            components=self._components,
            context_components=self.context_components,
            endpoint_configurations=self._endpoint_configurations,
            enable_devtools=self.enable_devtools,
            js_module_name=self.js_module_name,
            live_reload=self.live_reload,
            package_tag_processors=self._package_tags_processors,
            pages=self._pages,
            routes=self.routes,
            static_files_dir=self.static_files_dir,
            scheduled_jobs=self.scheduled_jobs,
            startup_functions=self.startup_functions,
            static_folders=self._static_folders,
            task_module=self.task_module,
            template=self.template,
            template_extra_js=self._template_extra_js,
            template_renderers=self._template_renderers,
            theme=self.theme,
            title=self.title,
            ws_handlers=self._custom_ws_handlers,
        )
