import unittest
from unittest.mock import patch

from dara.components.common import Carousel
from dara.components.common.utils import CarouselItem


class TestCarouselComponent(unittest.TestCase):
    """Test the Carousel component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp = Carousel(items=[CarouselItem(title='test', subtitle='item')])
        expected_dict = {
            'name': 'Carousel',
            'props': {
                'children': [],
                'items': [{'title': 'test', 'subtitle': 'item'}],
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
