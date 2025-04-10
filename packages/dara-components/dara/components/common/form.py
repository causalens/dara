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

from typing import List, Optional

from pydantic import field_validator

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

    form_variable = Variable({'MyInput' : 'default text'})

    Form(
        Text('My first form'),
        Input(id='MyInput'),
        value=form_variable,
    )

    ```

    If you don't need to keep track of the components as they update, but instead only need it once user submits
    their results, you can use the `onsubmit` param:

    ```python

    from dara.core.definitions import Variable
    from dara.components.common import Form, Datepicker, RadioGroup

    onsubmit_var = Variable({})

    Form(
        Datepicker(id='Datepicker'),
        RadioGroup(items=['cat', 'dog', 'parrot'], direction='horizontal', id='RadioGroup'),
        onsubmit=onsubmit_var.sync(),
    )

    ```

    Forms may also have pages, check `FormPage` component docs for more info on this.

    :param value: A Variable dictionary recording the state of the form. This dictionary must have its keys
        matching the ids from the form components. This can also be used to set initial values to these components.
    :param onsubmit: An Action that is triggered when the form is submitted
    :param justify: How to justify the content of the form, accepts any flexbox justifications
    :param align: How to align the content of the form, accepts any flexbox alignments
    """

    value: Optional[Variable[dict]] = None
    onsubmit: Optional[Action] = None

    @field_validator('children')
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
