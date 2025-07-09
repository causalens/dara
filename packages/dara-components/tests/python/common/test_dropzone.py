import unittest
import uuid
from unittest.mock import patch

from fastapi.encoders import jsonable_encoder

from dara.components.common import UploadDropzone
from dara.core.interactivity import DataVariable

test_uid = uuid.uuid4()


class TestUploadDropzoneComponent(unittest.TestCase):
    """Test the UploadDropzone component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization_default(self, _uid):
        """Test the component serializes correctly with default props"""
        cmp = UploadDropzone()
        result = jsonable_encoder(cmp, exclude_none=True)

        # Check basic structure
        self.assertEqual(result['name'], 'UploadDropzone')
        self.assertEqual(result['uid'], str(test_uid))
        self.assertIn('props', result)
        self.assertIn('resolver_id', result['props'])

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization_with_accept(self, _uid):
        """Test the component serializes correctly with accept parameter"""
        cmp = UploadDropzone(accept='.zip')
        result = jsonable_encoder(cmp, exclude_none=True)

        # Check accept prop is passed through
        self.assertEqual(result['props']['accept'], '.zip')

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization_with_target(self, _uid):
        """Test the component serializes correctly with DataVariable target"""
        data_var = DataVariable()
        cmp = UploadDropzone(target=data_var)
        result = jsonable_encoder(cmp, exclude_none=True)

        # Check target prop is passed through
        self.assertEqual(result['props']['target'], data_var.model_dump(exclude_none=True))

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization_with_enable_paste(self, _uid):
        """Test the component serializes correctly with enable_paste parameter"""
        cmp = UploadDropzone(enable_paste=True)
        result = jsonable_encoder(cmp, exclude_none=True)

        # Check enable_paste prop is passed through
        self.assertTrue(result['props']['enable_paste'])
