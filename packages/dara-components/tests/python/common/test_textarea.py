import unittest
import uuid
from unittest.mock import patch

from dara.components.common import Textarea
from dara.core.interactivity import Variable

test_uid = uuid.uuid4()


class TestTextareaComponent(unittest.TestCase):
    """
    Test the Textarea component
    """

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """
        Test the component serializes to a dict
        """
        value = Variable()
        cmp = Textarea(value=value)
        expected_dict = {
            'name': 'Textarea',
            'props': {
                'autofocus': False,
                'bold': False,
                'children': [],
                'italic': False,
                'value': value.dict(exclude_none=True),
                'underline': False,
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
