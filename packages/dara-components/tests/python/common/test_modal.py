import unittest
import uuid
from unittest.mock import patch

from dara.components.common import Modal
from dara.core.interactivity import Variable

from tests.python.utils import MockComponent

test_uid = uuid.uuid4()


class TestModalComponent(unittest.TestCase):
    """Test the Modal component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        t1 = MockComponent(test_id='ModalText')
        show = Variable(default=False)
        cmp = Modal(t1, show=show)

        expected_dict = {
            'name': 'Modal',
            'props': {
                'children': [t1.dict(exclude_none=True)],
                'bold': False,
                'italic': False,
                'position': 'relative',
                'underline': False,
                'show': show.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
