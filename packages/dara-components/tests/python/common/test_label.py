import unittest
import uuid
from unittest.mock import patch

from dara.components.common import Input, Label
from dara.core.visual.components.types import Direction

test_uid = uuid.uuid4()


class TestLabelComponent(unittest.TestCase):
    """Test the Label component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        input = Input()
        cmp = Label(input, value='test label:')

        expected_dict = {
            'name': 'Label',
            'props': {
                'children': [input.dict(exclude_none=True)],
                'bold': False,
                'italic': False,
                'direction': Direction.VERTICAL.value,
                'underline': False,
                'value': 'test label:',
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)

    def test_validate_one_child(self):
        """Test the component accepts a max of one child"""
        input1 = Input()
        input2 = Input()

        # Just one component should be allowed
        Label(input1, value='test label')

        # Multiple components is not allowed
        with self.assertRaises(TypeError) as cm:
            Label(input1, input2, value='test label')
