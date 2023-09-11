from unittest import TestCase
from unittest.mock import patch

from dara.components.common import Image


class TestImageComponent(TestCase):
    """Test the Image component"""

    def test_error_handling(self):
        """Test the error handling of the component"""
        # must provide src
        with self.assertRaises(ValueError):
            Image()

        # src must be /static/... or http...
        with self.assertRaises(ValueError):
            Image(src='not static nor http')

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp = Image(src='static/test.jpg')
        expected_dict = {
            'name': 'Image',
            'props': {
                'children': [],
                'bold': False,
                'italic': False,
                'underline': False,
                'src': 'static/test.jpg',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
