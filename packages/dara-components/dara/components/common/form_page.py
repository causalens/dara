"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List, Optional

from pydantic import validator

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

    @validator('children')
    @classmethod
    def validate_children(cls, children: List[ComponentInstance]) -> List[ComponentInstance]:
        for c in children:
            if isinstance(c, FormPage):
                raise TypeError('FormPage detected inside another FormPage, nesting is disallowed')

        return children
