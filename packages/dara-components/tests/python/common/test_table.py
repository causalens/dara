import unittest
from unittest.mock import patch

import pandas

from dara.core import DataVariable
from dara.components.common import Table
from dara.components.common.table import TableFormatterType


class TestTableComponent(unittest.TestCase):
    """Test the Table component"""

    def setUp(self):
        self.columns = [
            {'col_id': 'name', 'label': 'Forename', 'width': '200px'},
            {'col_id': 'surname', 'label': 'Surname'},
            {'align': 'right', 'col_id': 'age', 'label': 'Age'},
        ]

    def test_add_column(self):
        """Test adding an extra column to the table"""
        cmp = Table(columns=self.columns, data=DataVariable())

        col = {'col_id': 'height', 'label': 'Height'}
        cmp.add_column(col)

        self.assertEqual(len(cmp.columns), 4)
        self.assertEqual(cmp.columns[3].col_id, 'height')
        self.assertEqual(cmp.columns[3].label, 'Height')

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""
        self.maxDiff = None
        data_var = DataVariable(uid='uid')
        cmp = Table(columns=self.columns, data=data_var)
        expected_dict = {
            'name': 'Table',
            'props': {
                'children': [],
                'bold': False,
                'include_index': True,
                'italic': False,
                'underline': False,
                'columns': [
                    {
                        'col_id': 'name',
                        'label': 'Forename',
                        'width': '200px',
                    },
                    {'col_id': 'surname', 'label': 'Surname'},
                    {
                        'align': 'right',
                        'col_id': 'age',
                        'label': 'Age',
                    },
                ],
                'data': data_var.dict(exclude_none=True),
                'multi_select': False,
                'show_checkboxes': True,
                'searchable': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)

        # Test formatter serialization
        cols = [
            {'col_id': 'col1', 'formatter': {'precision': 2, 'type': TableFormatterType.NUMBER}},
            {'formatter': {'language': 'js', 'type': TableFormatterType.CODE}, 'col_id': 'code', 'label': 'Code'},
            'col2',
        ]
        data_var = DataVariable(uid='uid2')
        cmp = Table(data=data_var, columns=cols)

        expected_dict = {
            'name': 'Table',
            'props': {
                'children': [],
                'bold': False,
                'italic': False,
                'include_index': True,
                'underline': False,
                'columns': [
                    {
                        'col_id': 'col1',
                        'label': 'col1',
                        'formatter': {'precision': 2, 'type': TableFormatterType.NUMBER.value},
                    },
                    {
                        'col_id': 'code',
                        'label': 'Code',
                        'formatter': {'language': 'js', 'type': TableFormatterType.CODE.value},
                    },
                    {'col_id': 'col2', 'label': 'col2'},
                ],
                'data': data_var.dict(exclude_none=True),
                'multi_select': False,
                'show_checkboxes': True,
                'searchable': False,
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
