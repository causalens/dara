import unittest
from unittest.mock import patch

from dara.components.common import Spacer


class TestSpacerComponent(unittest.TestCase):
    """Test the Spacer component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp_no_args = Spacer()
        expected_dict = {
            'name': 'Spacer',
            'props': {
                'children': [],
                'inset': '0rem',
                'line': False,
                'size': '0.75rem',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp_no_args.dict(exclude_none=True), expected_dict)

        cmp_with_args = Spacer(line=True, size=12, inset='5%', align='start')
        expected_dict = {
            'name': 'Spacer',
            'props': {
                'align': 'start',
                'children': [],
                'inset': '5%',
                'line': True,
                'size': '12px',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp_with_args.dict(exclude_none=True), expected_dict)
