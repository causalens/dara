import unittest
from unittest.mock import patch

from dara.components.common import Stack
from dara.core.visual.components.types import Direction

from tests.python.utils import MockComponent


class TestStackComponent(unittest.TestCase):
    """Test the Stack component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        t1 = MockComponent(test_id='Element1')
        t2 = MockComponent(test_id='Element2')

        test_stack = Stack(t1, t2)

        # Default styling fields (bold, italic, underline, hug, etc.) are excluded
        # from serialization when they match their defaults. Component-specific defaults
        # like collapsed, direction, scroll are still included since the client
        # does not apply matching defaults for those.
        expected_dict = {
            'name': 'Stack',
            'props': {
                'children': [t1.dict(exclude_none=True), t2.dict(exclude_none=True)],
                'collapsed': False,
                'direction': Direction.VERTICAL.value,
                'position': 'relative',
                'scroll': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(test_stack.dict(exclude_none=True), expected_dict)

        test_with_args_stack = Stack(t1, t2, align='end', direction=Direction.HORIZONTAL)

        expected_with_args_dict = {
            'name': 'Stack',
            'props': {
                'align': 'end',
                'children': [t1.dict(exclude_none=True), t2.dict(exclude_none=True)],
                'collapsed': False,
                'direction': Direction.HORIZONTAL.value,
                'position': 'relative',
                'scroll': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(test_with_args_stack.dict(exclude_none=True), expected_with_args_dict)
