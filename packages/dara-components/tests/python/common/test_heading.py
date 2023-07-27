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
                'bold': False,
                'children': [],
                'heading': 'Heading',
                'italic': False,
                'level': 3,
                'underline': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
