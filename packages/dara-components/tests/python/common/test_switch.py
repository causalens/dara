import unittest
import uuid
from unittest.mock import patch

from dara.components.common import Switch
from dara.core.interactivity import Variable

test_uid = uuid.uuid4()


class TestSwitchComponent(unittest.TestCase):
    """
    Test the Switch component
    """

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """
        Test the component serializes to a dict
        """
        value = Variable()
        cmp = Switch(value=value)
        expected_dict = {
            'name': 'Switch',
            'props': {
                'children': [],
                'value': value.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
