import unittest
from unittest.mock import patch

from dara.components.common import HtmlRaw


class TestHtmlRawComponent(unittest.TestCase):
    """Test the HTML Raw component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        html = '<iframe height="100%" width="100%" src="https://www.youtube.com/embed/tgbNymZ7vqY"></iframe>'
        cmp = HtmlRaw(html=html)
        expected_dict = {
            'name': 'HtmlRaw',
            'props': {
                'children': [],
                'html': html,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
