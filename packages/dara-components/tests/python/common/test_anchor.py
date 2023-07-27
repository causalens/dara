import unittest
from unittest.mock import patch

from dara.components import Anchor, Stack, LayoutError

from tests.python.utils import MockComponent


class TestAnchorComponent(unittest.TestCase):
    """Test the Anchor component"""

    def test_child_validation(self):
        """Test that only 0 or 1 ContentComponents can be passed in"""
        with self.assertRaises(LayoutError):
            Anchor(Stack())

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        t1 = MockComponent(test_id='1')
        cmp = Anchor(t1, href='#anchor1', name='anchor1')
        expected_dict = {
            'name': 'Anchor',
            'props': {
                'bold': False,
                'children': [t1.dict(exclude_none=True)],
                'clean': False,
                'href': '#anchor1',
                'italic': False,
                'name': 'anchor1',
                'underline': False,
                'new_tab': False,
            },
            'uid': 'uid',
        }
        assert cmp.dict(exclude_none=True) == expected_dict
