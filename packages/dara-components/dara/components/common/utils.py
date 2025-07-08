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

import os
from enum import Enum
from typing import Any, Optional, Union

from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.definitions import ComponentInstanceType


class ItemBadge(BaseModel):
    """Add a badge to an item in a list"""

    color: Optional[str] = None
    label: str


class Item(BaseModel):
    """
    A class for serializing a list of options for the select to show
    """

    badge: Optional[ItemBadge] = None
    image: Optional[str] = None
    label: str
    value: Union[str, int, float, BaseModel]

    def __init__(
        self,
        value: Union[str, int, float, BaseModel],
        label: str,
        badge: Optional[ItemBadge] = None,
        image: Optional[str] = None,
    ):
        # Handle general enums in the value field
        if isinstance(value, Enum):
            value = value.value

        super().__init__(value=value, label=label, badge=badge, image=image)

    @staticmethod
    def to_item(item: Any) -> 'Item':
        """
        Take whatever value was passed in and create an item out of it, or raise an error if not possible.

        :param item: the item to parse
        """
        if isinstance(item, Item):
            if item.image is not None:
                item.image = os.environ.get('DARA_BASE_URL', '') + item.image
            return item
        if isinstance(item, dict):
            if item.get('image') is not None:
                # Prepend base url
                item['image'] = os.environ.get('DARA_BASE_URL', '') + item['image']
            if item.get('label') is not None and item.get('value') is not None:
                try:
                    item['label'] = str(item.get('label'))
                    return Item(**item)
                except Exception as err:
                    raise ValueError(f'Item dictionary: {item} could not be parsed correctly') from err
            raise ValueError(f"An Item dictionary should contain 'label' and 'value' keys, got {item}")
        try:
            label = str(item)
            return Item(label=label, value=item)
        except Exception as e:
            raise ValueError(
                f'Item: {item} could not be parsed correctly. If your item is a complex structure please pass in an '
                f'Item class, with a string label defined'
            ) from e


class CarouselItem(BaseModel):
    """
    CarouselItem provides with the following props:

    :param title: An optional string title
    :param subtitle: An optional string subtitle
    :param component: An optional Dara component to render in the Carousel
    :param image: An optional image url for the Carousel item to display
    :param image_alt: The alt text for that image
    :param image_height: Optional string containing the height the image should take
    :param image_width: Optional string containing the width the image should take
    """

    title: Optional[str] = None
    subtitle: Optional[str] = None
    component: Optional[ComponentInstanceType] = None
    image: Optional[str] = None
    image_alt: Optional[str] = None
    image_height: Optional[str] = None
    image_width: Optional[str] = None

    def __init__(
        self,
        title: Optional[str] = None,
        subtitle: Optional[str] = None,
        component: Optional[ComponentInstanceType] = None,
        image: Optional[str] = None,
        image_alt: Optional[str] = None,
        image_height: Optional[str] = None,
        image_width: Optional[str] = None,
    ):
        super().__init__(
            title=title,
            subtitle=subtitle,
            component=component,
            image=image,
            image_alt=image_alt,
            image_height=image_height,
            image_width=image_width,
        )

    @staticmethod
    def to_item(item: Any) -> 'CarouselItem':
        """
        Take whatever value was passed in and create an item out of it, or raise an error if not possible.

        :param item: the item to parse
        """
        if isinstance(item, CarouselItem):
            if item.image is not None:
                item.image = os.environ.get('DARA_BASE_URL', '') + item.image
            return item
        if isinstance(item, dict):
            if item.get('image') is not None:
                # Prepend base url
                item['image'] = os.environ.get('DARA_BASE_URL', '') + item['image']
            try:
                return CarouselItem(**item)
            except Exception as err:
                raise ValueError(f'CarouselItem dictionary: {item} could not be parsed correctly') from err
        try:
            title = str(item)
            return CarouselItem(title=title)
        except Exception as e:
            raise ValueError(
                f'CarouselItem: {item} could not be parsed correctly. If your item is a complex structure please pass in an '
                f'CarouselItem class'
            ) from e
