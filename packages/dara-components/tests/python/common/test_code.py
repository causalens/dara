import unittest
from unittest.mock import patch

from dara.components.common import Code


class TestCodeComponent(unittest.TestCase):
    """Test the Code component"""

    def setUp(self):
        self.code = 'def some_func():\n    pass'

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp = Code(code=self.code, language='js')
        expected_dict = {
            'name': 'Code',
            'props': {
                'children': [],
                'code': self.code,
                'language': 'js',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
