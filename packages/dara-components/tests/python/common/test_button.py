import unittest
import uuid
from unittest.mock import patch

from fastapi.encoders import jsonable_encoder

from dara.components.common import Button, Text
from dara.components.common.button import ButtonStyle
from dara.core.interactivity.actions import NavigateTo

test_uid = uuid.uuid4()


class TestButtonComponent(unittest.TestCase):
    """Test the Button component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        action = NavigateTo(url='/test')
        cmp = Button('Click Here', onclick=action)
        expected_dict = {
            'name': 'Button',
            'props': {
                'bold': False,
                'children': [Text(text='Click Here').dict(exclude_none=True)],
                'italic': False,
                'onclick': action.dict(),
                'styling': ButtonStyle.PRIMARY.value,
                'outline': False,
                'position': 'relative',
                'underline': False,
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(jsonable_encoder(cmp, exclude_none=True), expected_dict)
