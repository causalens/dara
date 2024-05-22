import unittest
import uuid
from unittest.mock import patch

from dara.core.interactivity import Variable
from dara.components.common import Datepicker

test_uid = uuid.uuid4()


class TestDatepickerComponent(unittest.TestCase):
    """
    Test the Datepicker component
    """

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """
        Test the component serializes to a dict
        """
        value = Variable()
        cmp = Datepicker(value=value)
        expected_dict = {
            'name': 'Datepicker',
            'props': {
                'bold': False,
                'children': [],
                'value': value.dict(exclude_none=True),
                'date_format': 'dd/MM/yyyy',
                'enable_time': False,
                'italic': False,
                'range': False,
                'select_close': True,
                'underline': False,
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
