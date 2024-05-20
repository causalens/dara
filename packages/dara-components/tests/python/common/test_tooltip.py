from unittest import TestCase
from unittest.mock import patch

from dara.components.common import Tooltip
from dara.components.common.stack import Stack

from tests.python.utils import MockComponent


class TestTooltipComponent(TestCase):
    """Test the Tooltip component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        t1 = MockComponent(test_id='test')
        cmp = Tooltip(t1, content='Hover Content')
        expected_dict = {
            'name': 'Tooltip',
            'props': {
                'children': [Stack(t1).dict(exclude_none=True)],
                'content': 'Hover Content',
                'placement': 'auto',
                'styling': 'default',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)

        t2 = MockComponent(test_id='hover')
        t1_stack = Stack(t1)
        cmp = Tooltip(t1_stack, content=t2, placement='bottom')
        expected_dict = {
            'name': 'Tooltip',
            'props': {
                'children': [t1_stack.dict(exclude_none=True)],
                'content': t2.dict(exclude_none=True),
                'placement': 'bottom',
                'styling': 'default',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
