import unittest
import uuid
from unittest.mock import patch

from dara.core.interactivity import Operator, Variable
from dara.components.common import If

from tests.python.utils import MockComponent

test_uid = uuid.uuid4()


class TestIfComponent(unittest.TestCase):
    """Test the If component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        var = Variable()
        t1 = MockComponent(test_id='t1')
        t2 = MockComponent(test_id='t2')
        t3 = MockComponent(test_id='t3')
        cmp = If(var == True, [t1, t2], t3)
        expected_dict = {
            'name': 'If',
            'props': {
                'children': [],
                'condition': {
                    'operator': Operator.EQUAL,
                    'other': True,
                    'variable': {'nested': [], 'uid': str(var.uid), 'persist_value': False, '__typename': 'Variable'},
                },
                'false_children': [t3.dict(exclude_none=True)],
                'true_children': [t1.dict(exclude_none=True), t2.dict(exclude_none=True)],
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
