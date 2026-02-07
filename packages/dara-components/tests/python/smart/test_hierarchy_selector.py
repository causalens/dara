import unittest
import uuid
from unittest.mock import patch

from dara.components.smart.hierarchy import HierarchySelector, Node
from dara.core.interactivity import Variable

test_uid = uuid.uuid4()


class TestHierarchySelectorComponent(unittest.TestCase):
    """Test the Select component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        value = Variable()
        cmp = HierarchySelector(hierarchy=Node.from_string('node1', children=[Node.from_string('node2')]), value=value)

        expected_dict = {
            'name': 'HierarchySelector',
            'props': {
                'allow_category_select': True,
                'allow_leaf_select': True,
                'hierarchy': {
                    'children': [{'id': 'node2', 'label': 'node2', 'weight': 0.0}],
                    'id': 'node1',
                    'label': 'node1',
                    'weight': 0.0,
                },
                'open_all': True,
                'value': value.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
