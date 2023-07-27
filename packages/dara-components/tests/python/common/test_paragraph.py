import unittest
from unittest.mock import patch

from dara.components.common import LayoutError
from dara.components.common import Code, Paragraph, Text


class TestParagraphComponent(unittest.TestCase):
    """Test the Paragraph component"""

    def test_throw_invalid_child(self):
        """Test that paragraph throws if you try and pass an invalid child"""
        with self.assertRaises(LayoutError):
            Paragraph(Code(code=''))

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        self.maxDiff = None
        t1 = Text(text='Some text.')
        t2 = Text(text='More text')
        cmp = Paragraph(t1, t2)

        expected_dict = {
            'name': 'Paragraph',
            'props': {
                'bold': False,
                'children': [t1.dict(exclude_none=True), t2.dict(exclude_none=True)],
                'italic': False,
                'position': 'relative',
                'underline': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
