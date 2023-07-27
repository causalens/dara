import unittest
from unittest.mock import patch

from dara.components.common import Markdown


class TestMarkdownComponent(unittest.TestCase):
    """Test the Markdown component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        markdown_text = """\
# Heading
Some text
*italic words* **bold words**
## List
+ Sub-lists:
- Marker
* Another marker

[link text](https://www.causalens.com/)\
"""
        cmp = Markdown(markdown=markdown_text)
        expected_dict = {
            'name': 'Markdown',
            'props': {
                'bold': False,
                'children': [],
                'html_raw': False,
                'italic': False,
                'markdown': '# Heading\nSome text\n*italic words* **bold words**\n## List\n+ Sub-lists:\n- Marker\n* Another marker\n\n[link text](https://www.causalens.com/)',
                'underline': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
