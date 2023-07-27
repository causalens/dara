"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional

from dara.core.definitions import ComponentInstance, JsComponentDef

SideBarFrameDef = JsComponentDef(name='SideBarFrame', js_module='@darajs/core', py_module='dara.core')


class SideBarFrame(ComponentInstance):
    content: ComponentInstance
    hide_logo: Optional[bool] = False
    logo_width: Optional[str] = '80%'
    logo_path: Optional[str] = None
    logo_position: Optional[str] = None
    side_bar: ComponentInstance
    side_bar_padding: Optional[str] = None
    side_bar_position: Optional[str] = None
    side_bar_width: Optional[str] = None

    class Config:
        extra = 'forbid'
