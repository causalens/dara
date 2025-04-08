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

from dara.components.common.base_component import FormComponent
from dara.core.definitions import ComponentInstance


class FormPage(FormComponent):
    """
    ![FormPages](../../../../docs/packages/dara-components/common/assets/FormPages.gif)

    The FormPage component represents a section of the form to be displayed on a separate page. It is a
    wrapper that renders its children and includes next/back navigation buttons.
    Accepts an optional title parameter to display at the top of the page.

    A FormPage component can be created like so:

    ```python

    from dara.components import Form, FormPage, Textarea, Slider

    Form(
        FormPage(
            Slider(domain=[0.0, 10], id='MySlider'),
            Textarea(id='MyTextarea'),
            title="Page Title",
        )
    )

    ```

    :param title: The title of the form page
    """

    title: Optional[str] = None

    @field_validator('children')
    @classmethod
    def validate_children(cls, children: List[ComponentInstance]) -> List[ComponentInstance]:
        for c in children:
            if isinstance(c, FormPage):
                raise TypeError('FormPage detected inside another FormPage, nesting is disallowed')

        return children
