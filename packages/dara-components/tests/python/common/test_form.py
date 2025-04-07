import unittest
import uuid
from unittest.mock import patch

from pydantic.v1 import ValidationError

from dara.core.interactivity import Variable
from dara.components.common import Form, FormPage, Switch

test_uid = uuid.uuid4()


class TestFormComponent(unittest.TestCase):
    """Test the Form component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        form_state = Variable()
        s1 = Switch(id='switch')
        cmp = Form(s1, value=form_state)

        expected_dict = {
            'name': 'Form',
            'props': {
                'children': [s1.dict(exclude_none=True)],
                'bold': False,
                'italic': False,
                'position': 'relative',
                'underline': False,
                'value': form_state.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)

    def test_validate_children_pages(self):
        """Test the component validates children pagescorrectly"""
        form_state = Variable()
        fs1 = Switch(id='switch')
        fs2 = Switch(id='switch2')
        fs3 = Switch(id='switch3')

        # Just pages or just non-pages should be allowed
        Form(FormPage(fs1), FormPage(fs2), value=form_state)
        Form(fs3, value=form_state)

        # A mix is not allowed
        with self.assertRaises(ValidationError) as cm:
            Form(FormPage(fs1), fs3, FormPage(fs2), value=form_state)

        error = cm.exception.errors()[0]
        self.assertEqual('type_error', error['type'])
        self.assertEqual(('children',), error['loc'])