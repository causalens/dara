"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List, Optional

from pydantic import validator

from dara.components.common.base_component import LayoutComponent
from dara.core.base_definitions import Action
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import Variable


class Form(LayoutComponent):
    """
    ![Form](../../../../docs/packages/dara-components/common/assets/Form.png)

    The Form component keeps track of all interactive component states inside of it. You can also
    obtain these through an action via the `onsubmit` param or store them in a `Variable` with `value`
    param. The components states are stored in the format `{component_id: component_value}`.

    Interactive components inside the form must have an `id` prop set. Some examples of such components
    are Input, Select, Textarea, Datepicker and so on. It can have any type of component inside of it, not only
    interactive ones.

    A Form component is created like so, in this example when changing the input value would return the following
    object: `{'MyInput' : 'some text'}`

    ```python

    from dara.core.definitions import Variable
    from dara.components.common import Form, Input, Text

    Form(
        Text('My first form'),
        Input(id='MyInput'),
        value=Variable({})
    )

    ```

    If you don't need to keep track of the components as they update, but instead only need it once user submits
    their results you can use the `onsubmit` param:

    ```python

    from dara.core.definitions import Variable
    from dara.components.common import Form, Datepicker, RadioGroup

    onsubmit_var = Variable()

    Form(
        Datepicker(id='Datepicker'),
        RadioGroup(items=['cat', 'dog', 'parrot'], direction='horizontal', id='RadioGroup'),
        onsubmit=UpdateVariable(lambda ctx: ctx.inputs.new, onsubmit_var),
    )

    ```

    Forms may also have pages, check `FormPage` component docs for more info on this.

    :param value: A Variable dictionary recording the state of the form. This dictionaty must have its keys
        matching the ids from the form components. This can also be used to set initial values to these components.
    :param onsubmit: An Action that is triggered when the form is submitted
    """

    value: Optional[Variable[dict]] = None
    onsubmit: Optional[Action] = None

    @validator('children')
    @classmethod
    def validate_children_pages(cls, children: List[ComponentInstance]) -> List[ComponentInstance]:
        # Make sure if FormPage is included, non-pages are not direct children of the Form
        page_found = False
        non_page_found = False

        for c in children:
            if c.__class__.__name__ == 'FormPage':
                page_found = True
            else:
                non_page_found = True

        if page_found and non_page_found:
            raise TypeError(
                'Both a FormPage and a non-page form components found in a Form. All components need to be on a page '
                'if pages are used.'
            )

        return children
