import unittest
import uuid
from unittest.mock import patch

from dara.components.common import FormPage, Switch

test_uid = uuid.uuid4()


class TestFormPageComponent(unittest.TestCase):
    """Test the FormPage component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        s1 = Switch(id='switch')
        cmp = FormPage(s1, title='Page')

        expected_dict = {
            'name': 'FormPage',
            'props': {
                'children': [s1.dict(exclude_none=True)],
                'bold': False,
                'italic': False,
                'underline': False,
                'title': 'Page',
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)

    def test_validate_children(self):
        """Test the component validates children correctly"""
        page_nested = FormPage()

        with self.assertRaises(TypeError) as cm:
            FormPage(page_nested)
