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
from dara.core.base_definitions import Action
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

    A modal can also be closed by an external event, for example by clicking outside the modal.
    To run something when this happens, you can pass an `on_attempt_close` action.
    When you pass this action, the modal will not close automatically when the external event happens, it is up to the action to decide whether to close the modal.
    You can also pass an `on_closed` action to run something when the modal has finished closing and has unmounted.

    ```python
    from dara.core.interactivity import ActionCtx, action
    from dara.components.common import Modal, Text

    show = Variable(True)

    @action
    async def on_attempt_close(ctx: ActionCtx):
        print('Modal attempting to close')
        ctx.update(show, False)

    @action
    async def on_closed(ctx: ActionCtx):
        print('Modal closed')

    Modal(
        Text('Test Text'),
        show=show,
        on_attempt_close=on_attempt_close(),
        on_closed=on_closed()
    )

    ```

    :param show: Boolean Variable instance recording the state, if True it renders the model and it's children
    :param on_attempt_close: An optional event listener for if an external event (e.g. esc key) tries to close the modal, it's up to the
        parent component to decide whether to close the modal. if not passed, by default the modal will set the show variable to False.
    :param on_closed: A handler that's called when the modal has finished closing and has unmounted
    :param justify: How to justify the content of the modal, accepts any flexbox justifications
    :param align: How to align the content of the modal, accepts any flexbox alignments
    """

    show: ClientVariable
    on_attempt_close: Action | None = None
    on_closed: Action | None = None
