import unittest
from unittest.mock import patch

from dara.components.common import Heading


class TestHeadingComponent(unittest.TestCase):
    """Test the Heading component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp = Heading('Heading', level=3)
        expected_dict = {
            'name': 'Heading',
            'props': {
                'children': [],
                'heading': 'Heading',
                'level': 3,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
