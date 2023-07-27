import unittest
from unittest.mock import patch

from dara.components.common import Stack
from dara.core.visual.components.types import Direction

from tests.python.utils import MockComponent


class TestStackComponent(unittest.TestCase):
    """Test the Stack component"""

    maxDiff = None

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        t1 = MockComponent(test_id='Element1')
        t2 = MockComponent(test_id='Element2')

        test_stack = Stack(t1, t2)

        expected_dict = {
            'name': 'Stack',
            'props': {
                'bold': False,
                'children': [t1.dict(exclude_none=True), t2.dict(exclude_none=True)],
                'collapsed': False,
                'direction': Direction.VERTICAL.value,
                'italic': False,
                'position': 'relative',
                'scroll': False,
                'hug': False,
                'underline': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(test_stack.dict(exclude_none=True), expected_dict)

        test_with_args_stack = Stack(t1, t2, align='end', direction=Direction.HORIZONTAL)

        expected_with_args_dict = {
            'name': 'Stack',
            'props': {
                'align': 'end',
                'bold': False,
                'children': [t1.dict(exclude_none=True), t2.dict(exclude_none=True)],
                'collapsed': False,
                'direction': Direction.HORIZONTAL.value,
                'italic': False,
                'position': 'relative',
                'scroll': False,
                'hug': False,
                'underline': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(test_with_args_stack.dict(exclude_none=True), expected_with_args_dict)
