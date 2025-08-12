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

from dara.components.common.base_component import LayoutComponent
from dara.core.interactivity import ClientVariable


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
    :param justify: How to justify the content of the modal, accepts any flexbox justifications
    :param align: How to align the content of the modal, accepts any flexbox alignments
    """

    show: ClientVariable
