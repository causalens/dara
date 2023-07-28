import unittest
from unittest.mock import patch

from dara.components.common import Icon


class TestIconComponent(unittest.TestCase):
    """Test the Icon component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp = Icon(icon='wrench', color='red')
        expected_dict = {
            'name': 'Icon',
            'props': {
                'children': [],
                'bold': False,
                'italic': False,
                'underline': False,
                'icon': 'wrench',
                'color': 'red',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
