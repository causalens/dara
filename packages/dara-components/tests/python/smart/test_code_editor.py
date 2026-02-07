import unittest
import uuid
from unittest.mock import patch

from dara.components.smart import CodeEditor
from dara.core.interactivity import Variable

test_uid = uuid.uuid4()


class TestCodeEditorComponent(unittest.TestCase):
    """Test the CodeEditor component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        script = Variable()
        cmp = CodeEditor(script=script)
        expected_dict = {
            'name': 'CodeEditor',
            'props': {
                'script': script.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
