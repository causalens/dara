import unittest
from unittest.mock import patch

from dara.components.common import (
    BaseDashboardComponent,
    ContentComponent,
    LayoutComponent,
    LayoutError,
)

from tests.python.utils import MockComponent


class TestBaseComponent(unittest.TestCase):
    def test_child_validation(self):
        """Test that children are correctly validated when being passed as args"""

        with self.assertRaises(ValueError):
            BaseDashboardComponent('fail_child')

    @patch('dara.core.definitions.uuid.uuid4', return_value='uid')
    def test_serialization(self, _uid):
        """Test that the base component correctly serializes itself + children"""
        t1 = MockComponent(test_id='1')
        t2 = MockComponent(test_id='2')

        cmp = BaseDashboardComponent(t1, t2, t1, width=10, height='10%')

        expected = {
            'name': 'BaseDashboardComponent',
            'props': {
                'children': [t1.dict(exclude_none=True), t2.dict(exclude_none=True), t1.dict(exclude_none=True)],
                'height': '10%',
                'width': '10px',
            },
            'uid': 'uid',
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected, cmp.dict(exclude_none=True))

    def test_layout_component_append(self):
        """Test that you can append extra components to any LayoutComponent"""
        t1 = MockComponent(test_id='1')
        t2 = MockComponent(test_id='2')

        empty_layout = LayoutComponent()
        self.assertEqual(len(empty_layout.children), 0)

        for child in [t1, t2]:
            empty_layout.append(child)

        self.assertEqual(len(empty_layout.children), 2)
        self.assertEqual(empty_layout.children[0], t1)
        self.assertEqual(empty_layout.children[1], t2)

    def test_layout_component_pop(self):
        """Test that you can pop the last element of any LayoutComponent"""
        t1 = MockComponent(test_id='1')
        t2 = MockComponent(test_id='2')

        layout = LayoutComponent(t1, t2)
        self.assertEqual(len(layout.children), 2)

        self.assertEqual(layout.pop(), t2)
        self.assertEqual(len(layout.children), 1)

        self.assertEqual(layout.pop(), t1)
        self.assertEqual(len(layout.children), 0)

        with self.assertRaises(IndexError):
            layout.pop()

    def test_content_component_child_validation(self):
        layout = LayoutComponent(MockComponent(test_id='1'))

        with self.assertRaises(LayoutError):
            ContentComponent(layout)
