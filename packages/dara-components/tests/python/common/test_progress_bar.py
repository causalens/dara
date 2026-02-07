import unittest
from unittest.mock import patch

from dara.components.common import ProgressBar


class TestProgressBarComponent(unittest.TestCase):
    """Test the Progress Bar component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        cmp = ProgressBar(progress=50, small=True)
        expected_dict = {
            'name': 'ProgressBar',
            'props': {
                'children': [],
                'progress': 50,
                'small': True,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
