import unittest
import uuid
from unittest.mock import patch

from dara.components.common import CheckboxGroup
from dara.core.interactivity import Variable

test_uid = uuid.uuid4()


class TestCheckboxComponent(unittest.TestCase):
    """Test the Checkbox component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        value = Variable()
        cmp = CheckboxGroup(value=value, items=['test1', 'test2', 'test3'], select_max=2)

        expected_dict = {
            'name': 'CheckboxGroup',
            'props': {
                'bold': False,
                'children': [],
                'italic': False,
                'items': [
                    {'label': 'test1', 'value': 'test1'},
                    {'label': 'test2', 'value': 'test2'},
                    {'label': 'test3', 'value': 'test3'},
                ],
                'list_styling': False,
                'select_max': 2,
                'underline': False,
                'value': value.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
