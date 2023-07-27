"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional

from dara.core.definitions import ComponentInstance, JsComponentDef

TopBarFrameDef = JsComponentDef(name='TopBarFrame', js_module='@darajs/core', py_module='dara.core')


class TopBarFrame(ComponentInstance):
    content: ComponentInstance
    hide_logo: Optional[bool] = False
    logo_width: Optional[str] = '10rem'
    logo_path: Optional[str] = None
    logo_position: Optional[str] = None
    top_bar: Optional[ComponentInstance] = None
    top_bar_padding: Optional[str] = None
    top_bar_position: Optional[str] = None
    top_bar_height: Optional[str] = None

    class Config:
        extra = 'forbid'
