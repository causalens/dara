import unittest
from unittest.mock import patch

from dara.components.common import Text


class TestTextComponent(unittest.TestCase):
    """Test the Text component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp_no_args = Text('Some Text')
        expected_dict = {
            'name': 'Text',
            'props': {
                'children': [],
                'formatted': False,
                'text': 'Some Text',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp_no_args.dict(exclude_none=True), expected_dict)

        cmp_with_args = Text('Some Text', align='center', width=10)
        expected_dict = {
            'name': 'Text',
            'props': {
                'children': [],
                'align': 'center',
                'formatted': False,
                'width': '10px',
                'text': 'Some Text',
            },
            'uid': 'uid',
        }
        self.assertEqual(cmp_with_args.dict(exclude_none=True), expected_dict)
