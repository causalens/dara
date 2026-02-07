import unittest
import uuid
from unittest.mock import patch

from fastapi.encoders import jsonable_encoder

from dara.components.common import If
from dara.core.interactivity import Operator, Variable

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
        cmp = If(var == True, [t1, t2], t3)  # noqa: E712
        expected_dict = {
            'name': 'If',
            'props': {
                'children': [],
                'condition': {
                    'operator': Operator.EQUAL.value,
                    'other': True,
                    'variable': jsonable_encoder(var, exclude_none=True),
                    '__typename': 'Condition',
                },
                'false_children': [jsonable_encoder(t3, exclude_none=True)],
                'true_children': [jsonable_encoder(t1, exclude_none=True), jsonable_encoder(t2, exclude_none=True)],
            },
            'uid': str(test_uid),
        }

        self.assertDictEqual(jsonable_encoder(cmp, exclude_none=True), expected_dict)
