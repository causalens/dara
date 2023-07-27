"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from dara.components.common.base_component import LayoutComponent
from dara.core.interactivity import NonDataVariable


class Modal(LayoutComponent):
    """
    ![Modal](../../../../docs/packages/dara-components/common/assets/Modal.png)

    The modal component accepts a set of children and renders them within a modal depending on the value of the show
    flag.

    A simple modal component can be rendered like:

    ```python

    from dara.core import Variable
    from dara.components.common import Modal, Text

    show=Variable(True)

    Modal(
        Text('Test Text'),
        show=show
    )

    ```

    :param show: Boolean Variable instance recording the state, if True it renders the model and it's children
    """

    show: NonDataVariable
