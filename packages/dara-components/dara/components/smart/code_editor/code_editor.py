"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from dara.core.definitions import StyledComponentInstance
from dara.core.interactivity import NonDataVariable


class CodeEditor(StyledComponentInstance):
    """
    A code editor component.

    :param script: The script to render
    """

    js_module = '@darajs/components'

    script: NonDataVariable

    class Config:
        extra = 'forbid'
