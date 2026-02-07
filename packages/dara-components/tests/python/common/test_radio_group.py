import unittest
import uuid
from unittest.mock import patch

from dara.components.common import RadioGroup
from dara.core.interactivity import Variable

test_uid = uuid.uuid4()


class TestRadioComponent(unittest.TestCase):
    """Test the Radio component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        value = Variable()
        cmp = RadioGroup(value=value, items=['test1', 'test2', 'test3'])

        expected_dict = {
            'name': 'RadioGroup',
            'props': {
                'children': [],
                'direction': 'vertical',
                'items': [
                    {'label': 'test1', 'value': 'test1'},
                    {'label': 'test2', 'value': 'test2'},
                    {'label': 'test3', 'value': 'test3'},
                ],
                'list_styling': False,
                'value': value.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
