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
from typing import Callable, Dict, List, Type, Union

from fastapi import Depends
from fastapi.params import Depends as DependsType

from dara.core.definitions import ApiRoute, EndpointConfiguration, HttpMethod


def _get_config_instances(annotations: Dict[str, type]) -> Dict[str, EndpointConfiguration]:
    """
    Get EndpointConfiguration instances to inject given the function annotations

    Retrieves instances from config_registry, if not found tries calling default().

    :param annotations: function annotations
    """
    from dara.core.internal.registries import config_registry

    configs = {}

    for var_name, var_type in annotations.items():
        if inspect.isclass(var_type) and issubclass(var_type, EndpointConfiguration):
            try:
                config_instance = config_registry.get(var_type.__name__)
            except KeyError:
                # No instance registered, try to get default
                config_instance = var_type.default()

            configs[var_name] = config_instance

    return configs


def _method_decorator(method: HttpMethod):
    """Create a decorator for a given HTTP method"""

    def _decorator(url: str, dependencies: Union[List[DependsType], None] = None, authenticated: bool = True):
        if dependencies is None:
            dependencies = []

        def _inner(func: Callable):
            # Make sure we're using a copy of the dependencies list
            final_dependencies = dependencies[:]

            # `authenticated` is a convenience API that adds the token verification dependency
            if authenticated:
                from dara.core.auth.routes import verify_session

                final_dependencies.append(Depends(verify_session))

            # Inspect the signature, extract the configurations required
            # Create new annotations and params for the proxy handler
            new_annotations = {}
            params = OrderedDict()

            configurations: List[Type[EndpointConfiguration]] = []
            sig = inspect.signature(func)
            for var_name, typ in func.__annotations__.items():
                if inspect.isclass(typ) and issubclass(typ, EndpointConfiguration):
                    configurations.append(typ)
                else:
                    if var_name != 'return':
                        params[var_name] = sig.parameters.get(var_name)

                    new_annotations[var_name] = typ

            new_handler = None

            # Create a wrapper handler which will receive the instances of configurations
            if inspect.iscoroutinefunction(func):
                # func is async so proxy has to be async
                @wraps(func)
                async def _async_handler(*inner_args, **inner_kwargs):
                    injected_configurations = _get_config_instances(func.__annotations__)
                    return await func(*inner_args, **inner_kwargs, **injected_configurations)

                new_handler = _async_handler

            else:
                # func is sync so create a sync proxy
                @wraps(func)
                def _handler(*inner_args, **inner_kwargs):
                    injected_configurations = _get_config_instances(func.__annotations__)
                    return func(*inner_args, **inner_kwargs, **injected_configurations)

                new_handler = _handler

            new_handler.__annotations__ = new_annotations
            new_handler.__signature__ = inspect.Signature(  # type: ignore
                parameters=list(params.values()),
                return_annotation=sig.return_annotation,  # type: ignore
            )

            return ApiRoute(
                method=method,
                handler=new_handler,
                url=url,
                dependencies=final_dependencies,
            )

        return _inner

    return _decorator


get = _method_decorator(HttpMethod.GET)
post = _method_decorator(HttpMethod.POST)
patch = _method_decorator(HttpMethod.PATCH)
delete = _method_decorator(HttpMethod.DELETE)
put = _method_decorator(HttpMethod.PUT)
