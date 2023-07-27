"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List

from dara.core.definitions import ComponentInstance, JsComponentDef, TemplateRouterLink

MenuDef = JsComponentDef(name='Menu', js_module='@darajs/core', py_module='dara.core')


class Menu(ComponentInstance):
    routes: List[TemplateRouterLink]

    class Config:
        extra = 'forbid'
