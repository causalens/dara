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

import json
import uuid
from collections.abc import Awaitable, Callable, Mapping
from enum import Enum
from typing import (
    Annotated,
    Any,
    ClassVar,
    Literal,
    Protocol,
    TypeVar,
    runtime_checkable,
)

from fastapi.encoders import jsonable_encoder
from fastapi.params import Depends
from pydantic import (
    BeforeValidator,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
)

from dara.core.base_definitions import Action, ComponentType
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.css import CSSProperties
from dara.core.interactivity import AnyVariable


class HttpMethod(Enum):
    """HTTP Methods enum"""

    GET = 'GET'
    PATCH = 'PATCH'
    POST = 'POST'
    PUT = 'PUT'
    DELETE = 'DELETE'


class Session(BaseModel):
    session_id: str | None = None


DEFAULT_ERROR_TITLE = 'Unexpected error occurred'
DEFAULT_ERROR_DESCRIPTION = 'Try again or contact the application owner'


def _kebab_to_camel(string: str):
    chunks = string.split('-')
    return chunks[0] + ''.join([chunk[0].upper() + chunk[1:].lower() for chunk in chunks[1:]])


def transform_raw_css(value: Any):
    """
    Transform and validate a raw_css value.
    """
    from dara.core.interactivity.client_variable import ClientVariable

    if value is None:
        return None
    if isinstance(value, (str, ClientVariable, CSSProperties)):
        return value
    if isinstance(value, dict):
        return {_kebab_to_camel(k): v for k, v in value.items()}

    raise ValueError(f'raw_css must be a CSSProperties, dict, str, None or ClientVariable, got {type(value)}')


class ErrorHandlingConfig(BaseModel):
    title: str = DEFAULT_ERROR_TITLE
    """Title to display in the error boundary"""

    description: str = DEFAULT_ERROR_DESCRIPTION
    """Description to display in the error boundary"""

    raw_css: Annotated[Any | None, BeforeValidator(transform_raw_css)] = None
    """
    Raw styling to apply to the displayed error boundary.
    Accepts a CSSProperties, dict, str, or ClientVariable.
    """

    def model_dump(self, *args, **kwargs):
        result = super().model_dump(*args, **kwargs)

        # Exclude raw_css if not set
        if 'raw_css' in result and result.get('raw_css') is None:
            result.pop('raw_css')
        elif isinstance(self.raw_css, CSSProperties):
            # If it's an instance of CSSProperties, serialize but exclude none
            result['raw_css'] = self.raw_css.model_dump(exclude_none=True)

        return result


class ComponentInstance(BaseModel):
    """
    Definition of a Component Instance
    """

    uid: str = Field(default_factory=lambda: str(uuid.uuid4()))

    js_module: ClassVar[str | None] = None
    """
    JS module including the implementation of the component.

    Required for non-local components.
    """

    py_component: ClassVar[str | None] = None
    """
    Python unique component name. If not set, defaults to the class name.
    """

    js_component: ClassVar[str | None] = None
    """
    JS component name. If not set, defaults to the class name.
    """

    required_routes: ClassVar[list[ApiRoute]] = []
    """List of routes the component depends on. Will be implicitly added to the app if this component is used"""

    raw_css: Annotated[Any | None, BeforeValidator(transform_raw_css)] = None
    """
    Raw styling to apply to the component.
    Can be an dict/CSSProperties instance representing the `styles` tag, a string injected directly into the CSS of the wrapping component,
    or a ClientVariable resoling to either of the above.

    ```python

    from dara.core import CSSProperties, Variable

    # `style` - use the class for autocompletion/typesense
    Stack(..., raw_css=CSSProperties(maxWidth='100px'))

    # `style` - you can also use plain dict
    Stack(..., raw_css={'maxWidth': '100px'})

    # You can also provide CSS to inject directly
    Stack(..., raw_css=\"\"\"
    max-width: 100px;
    \"\"\")

    css_var = Variable('color: red;')
    Stack(..., raw_css=css_var)

    ```
    """

    track_progress: bool | None = False
    """Whether to use ProgressTracker to display progress updates from a task the component is subscribed to"""

    error_handler: ErrorHandlingConfig | None = None
    """Configure the error handling for the component"""

    fallback: BaseFallback | ComponentInstance | None = None
    """
    Fallback component to render in place of the actual UI if it has not finished loading
    """

    id_: str | None = None
    """
    An optional unique identifier for the component, defaults to None

    This is intended to help identify components with human-readable names in the serialized trees, and is also set as the `id` attribute of the DOM element
    """

    for_: str | None = None
    """
    An optional for attribute for the component, defaults to None

    This has no runtime effect and are intended to help identify components with human-readable names in the serialized trees, not in the DOM
    """

    def __repr__(self):
        return '__dara__' + json.dumps(jsonable_encoder(self))

    @field_validator('fallback', mode='before')
    @classmethod
    def validate_fallback(cls, fallback):
        if fallback is None:
            return None

        if isinstance(fallback, BaseFallback):
            return fallback

        # wrap custom component in fallback.custom
        if isinstance(fallback, ComponentInstance):
            from dara.core.visual.components.fallback import Fallback

            return Fallback.Custom(component=fallback)

        raise ValueError(f'fallback must be a BaseFallback or ComponentInstance, got {type(fallback)}')

    @classmethod
    def isinstance(cls, obj: Any) -> bool:
        return isinstance(obj, cls)

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        props = nxt(self)

        props.pop('uid')

        # Exclude raw_css if not set
        if 'raw_css' in props and props.get('raw_css') is None:
            props.pop('raw_css')
        elif isinstance(self.raw_css, CSSProperties):
            # If it's an instance of CSSProperties, serialize but exclude none
            props['raw_css'] = self.raw_css.model_dump(exclude_none=True)

        # Exclude track_progress if not set
        if 'track_progress' in props and props.get('track_progress') is False:
            props.pop('track_progress')

        # Exclude error handler if not set
        if 'error_handler' in props and props.get('error_handler') is None:
            props.pop('error_handler')

        # Exclude fallback if not set
        if 'fallback' in props and props.get('fallback') is None:
            props.pop('fallback')

        # Exclude id_ if not set
        if 'id_' in props and props.get('id_') is None:
            props.pop('id_')

        # Exclude for_ if not set
        if 'for_' in props and props.get('for_') is None:
            props.pop('for_')

        return {
            'name': self.py_component or type(self).__name__,
            'props': props,
            'uid': self.uid,
        }


@runtime_checkable
class CallableClassComponent(Protocol):
    """
    Callable class component protocol. Describes any class with a __call__ instance method returning a component instance.
    """

    def __call__(self) -> ComponentInstance: ...


DiscoverTarget = Callable[..., ComponentInstance] | ComponentInstance | type[CallableClassComponent]
DiscoverT = TypeVar('DiscoverT', bound=DiscoverTarget)


def discover(outer_obj: DiscoverT) -> DiscoverT:
    """
    Special marker for the Dara component discovery to continue the discovery.

    Will make sure to statically register all encountered dependencies of marked functional component or component class.
    Should not be necessary in most cases, mainly useful when creating component libraries.
    """
    outer_obj.__wrapped_by__ = discover  # type: ignore
    return outer_obj


AlignItems = Literal[
    '-moz-initial',
    'baseline',
    'center',
    'end',
    'flex-end',
    'flex-start',
    'inherit',
    'initial',
    'normal',
    'revert',
    'self-end',
    'self-start',
    'start',
    'stretch',
    'unset',
    None,
]


class StyledComponentInstance(ComponentInstance):
    """
    Base class for a component implementing the common styling props

    :param align: an alignment string, any flexbox alignment or start/center/end are accepted
    :param background: set a background color on the component
    :param basis: the flex-basis of the component, see css guidelines for flex-basis for formats
    :param bold: whether to bold the font, defaults to False
    :param border: whether to apply a border to the component, see css guidelines for formats
    :param border_radius: set the radius of a components corners (i.e. round them), see css guidelines for formats
    :param color: the text color of the component, defaults to inherit from document
    :param font: the font to use for this component, defaults to inherit from document
    :param font_size: the size of the font, defaults to inherit from document
    :param gap: the gap between the flex components children
    :param grow: the flex-grow of the component, see css guidelines for flex-grow for formats
    :param height: the height of the component, can be an number, which will be converted to pixels, or a string
    :param hug: Whether to hug the content, defaults to False
    :param italic: whether to italicize the font, defaults to False
    :param margin: the amount of margin to apply to the component, see css guidelines for formats
    :param max_height: the maximum height of the component, can be an number or a string
    :param max_width: the maximum width of the component, can be an number or a string
    :param min_height: the minimum height of the component, can be an number or a string
    :param min_width: the minimum width of the component, can be an number or a string
    :param overflow: whether to apply overflow to the component, see css guidelines for formats
    :param padding: the amount of padding to apply to the component, see css guidelines for formats
    :param shrink: the flex-shrink of the component, see css guidelines for flex-shrink for formats
    :param underline: whether to underline the font, defaults to False
    :param width: the width of the component, can be an number, which will be converted to pixels, or a string
    """

    align: AlignItems | None = None
    background: str | None = None
    basis: int | str | bool | None = None
    bold: bool = False
    border: str | None = None
    border_radius: float | int | str | None = None
    children: list[ComponentInstance] | None = None
    color: str | None = None
    font: str | None = None
    font_size: str | None = None
    gap: float | int | str | None = None
    grow: int | str | float | bool | None = None
    height: float | int | str | None = None
    hug: bool | None = None
    italic: bool = False
    margin: float | int | str | None = None
    max_height: float | int | str | None = None
    max_width: float | int | str | None = None
    min_height: float | int | str | None = None
    min_width: float | int | str | None = None
    overflow: str | None = None
    position: str | None = None
    padding: float | int | str | None = None
    shrink: int | str | float | bool | None = None
    underline: bool = False
    width: float | int | str | None = None

    @field_validator(
        'height',
        'basis',
        'border_radius',
        'gap',
        'margin',
        'max_width',
        'min_width',
        'max_height',
        'min_height',
        'padding',
        'width',
        mode='before',
    )
    @classmethod
    def validate_dimension(cls, value):
        if isinstance(value, (int, float)):
            return f'{int(value)}px'

        return value

    @field_validator('grow', 'shrink', mode='before')
    @classmethod
    def validate_flex(cls, value):
        if isinstance(value, (bool)):
            return 0 if value is False else 1

        return value

    @field_validator('children', mode='before')
    @classmethod
    def validate_children(cls, children):
        # Filter out None children
        if isinstance(children, list):
            return [x for x in children if x is not None]
        return children


class BaseFallback(StyledComponentInstance):
    suspend_render: bool | int = 200
    """
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

    @field_validator('suspend_render')
    @classmethod
    def validate_suspend_render(cls, value):
        if isinstance(value, int) and value < 0:
            raise ValueError('suspend_render must be a positive integer')

        return value


ComponentInstance.model_rebuild()

ComponentInstanceType = ComponentInstance | Callable[..., ComponentInstance]


class JsComponentDef(BaseModel):
    """Definition of a JS Component"""

    js_module: str | None = None
    """
    JS module where the component implementation lives.

    Not required for local components as they are located via dara.config.json
    """

    js_component: str | None = None
    """
    JS component name. If not set, defaults to `name` property.
    """

    py_module: str
    """Name of the PY module with component definition, used for versioning"""

    name: str
    """Name of the component, must match the Python definition and JS implementation"""

    type: Literal[ComponentType.JS] = ComponentType.JS


class PyComponentDef(BaseModel):
    """Definition of a Python Component"""

    func: Callable[..., Any] | None = None
    name: str
    dynamic_kwargs: Mapping[str, AnyVariable] | None = None
    fallback: BaseFallback | ComponentInstance | None = None
    polling_interval: int | None = None
    render_component: Callable[..., Awaitable[Any]]
    """Handler to render the component. Defaults to dara.core.visual.dynamic_component.render_component"""

    type: Literal[ComponentType.PY] = ComponentType.PY

    @field_validator('fallback', mode='before')
    @classmethod
    def validate_fallback(cls, fallback):
        if fallback is None:
            return None

        if isinstance(fallback, BaseFallback):
            return fallback

        # wrap custom component in fallback.custom
        if isinstance(fallback, ComponentInstance):
            from dara.core.visual.components.fallback import Fallback

            return Fallback.Custom(component=fallback)

        raise ValueError(f'fallback must be a BaseFallback or ComponentInstance, got {type(fallback)}')


# Helper type annotation for working with components
ComponentTypeAnnotation = PyComponentDef | JsComponentDef


class EndpointConfiguration(BaseModel):
    """Base class for endpoint configurations"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    @classmethod
    def default(cls):
        raise NotImplementedError(
            f'default is not implemented for configuration class {cls.__name__}. Add explicit configuration with config.add_configuration(ConfigurationClass(...))'
        )


class ApiRoute(BaseModel):
    """Definition of a route for the application's api"""

    dependencies: list[Depends] = []
    handler: Callable
    method: HttpMethod
    url: str
    model_config = ConfigDict(arbitrary_types_allowed=True)

    def __hash__(self):
        return hash((self.handler, self.method, self.url))


class Page(BaseModel):
    """Definition of a Page"""

    icon: str | None = None
    content: ComponentInstanceType
    name: str
    sub_pages: list[Page] | None = []
    url_safe_name: str
    include_in_menu: bool | None = None
    on_load: Action | None = None
    model_config = ConfigDict(extra='forbid')


class TemplateRoute(BaseModel):
    """Definition of a route for the TemplateRouter"""

    content: ComponentInstance
    icon: str | None = None
    name: str
    route: str
    include_in_menu: bool | None = None
    on_load: Action | None = None


class TemplateRouterLink(BaseModel):
    """Definition of a link for the TemplateRouter"""

    icon: str | None = None
    name: str
    route: str


class TemplateRouterContent(BaseModel):
    """Definition of a content section for the TemplateRouter"""

    content: ComponentInstance
    route: str
    on_load: Action | None = None
    name: str | None = None


class Template(BaseModel):
    """Definition of a template"""

    layout: ComponentInstance
    name: str
