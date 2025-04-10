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

from typing import List

from pydantic import ConfigDict

from dara.core.definitions import ComponentInstance, JsComponentDef, TemplateRouterLink

MenuDef = JsComponentDef(name='Menu', js_module='@darajs/core', py_module='dara.core')


class Menu(ComponentInstance):
    routes: List[TemplateRouterLink]
    model_config = ConfigDict(extra='forbid')
