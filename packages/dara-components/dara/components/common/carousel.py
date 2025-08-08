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

from typing import Any, List, Optional, Union

from pydantic import field_validator

from dara.components.common.base_component import ContentComponent
from dara.components.common.utils import CarouselItem
from dara.core.base_definitions import Action
from dara.core.interactivity import ClientVariable, Variable


class Carousel(ContentComponent):
    """
    ![Carousel](../../../../docs/packages/dara-components/common/assets/Carousel.gif)

    The carousel component takes a list of CarouselItems and displays them in a standard carousel format. The items should be
    a list of CarouselItems instances. The Carousel component is able to showcase text, images or any other component.

    A simple Carousel with text only can be created via:

    ```python
    from dara.components.common import Carousel, CarouselItem

    Carousel(
        items=[
            CarouselItem(title='Title', subtitle='This is some text description'),
            CarouselItem(title='Another Title', subtitle='This is some text description'),
        ]
    ),
    ```

    A Carousel may also have images:

    ```python
    from dara.components.common import Carousel, CarouselItem

    Carousel(
        items=[
            CarouselItem(
                image='https://moderncat.com/wp-content/uploads/2021/01/bigstock-Domestic-Cat-Beautiful-Old-Ca-353858042.png'
            ),
            CarouselItem(
                image='https://www.preventivevet.com/hs-fs/hubfs/pug%20treats.jpg?width=600&height=300&name=pug%20treats.jpg'
            ),
        ]
    ),
    ```

    Example of a complex Carousel which contains text, image and components:

    ```python

    from dara.components.common import Carousel, CarouselItem, Button, Slider, Label

    Carousel(
            items=[
                CarouselItem(
                    title='Cat',
                    subtitle='Image of a cat staring into oblivion',
                    image='https://moderncat.com/wp-content/uploads/2021/01/bigstock-Domestic-Cat-Beautiful-Old-Ca-353858042.png',
                    image_width='50%',
                    image_alt='Cat looking up',
                    component=Button('Component Example'),
                ),
                CarouselItem(
                    title='Dog',
                    subtitle='Image of a good boy getting his biscuit',
                    image='https://www.preventivevet.com/hs-fs/hubfs/pug%20treats.jpg?width=600&height=300&name=pug%20treats.jpg',
                    component=Label(
                        Slider(domain=[0, 10], disable_input_alternative=True),
                        value='Rate this image:',
                        direction='horizontal',
                        bold=True,
                    ),
                ),
            ]
        ),

    ```

    Do note that when passing images in the component of the CarouselItem, the image can cause the Carousel to change height as you scroll through the items. The Carousel automatically resizes to the height of the largest item.
    However if the image has not been rendered yet, the Carousel will not initially know the height of the image and can result in weird behavior. To avoid this, you can set an image height if passing it as part of the CarouselItem component prop.

    A Carousel can also be controlled by Variables, in the example below it will first render showing the second panel:

    ```python
    from dara.core import Variable
    from dara.components.common import Carousel, CarouselItem

    Carousel(
        items=[
            CarouselItem(title='First', subtitle='This is panel 0'),
            CarouselItem(title='Second', subtitle='This is panel 1'),
            CarouselItem(title='Third', subtitle='This is panel 2'),
        ]
        value=Variable(1)
    ),
    ```

    :param items: An CarouselItem list for the carousel to render
    :param value: The value of the Carousel, this takes the index of the panel it should show
    :param onchange: Action triggered when the component changes states
    """

    items: Union[List[CarouselItem], ClientVariable]
    value: Optional[Variable[int]] = None
    onchange: Optional[Action] = None

    @field_validator('items', mode='before')
    @classmethod
    def validate_items(cls, items: Any) -> Union[List[CarouselItem], ClientVariable]:
        if isinstance(items, ClientVariable):
            return items
        if not isinstance(items, list):
            raise ValueError('CarouselItem must be passed as a list to the Carousel component')
        if len(items) == 0:
            raise ValueError(
                'CarouselItem list is empty. You must provide at least one Item for the Carousel component'
            )
        return [CarouselItem.to_item(item) for item in items]
