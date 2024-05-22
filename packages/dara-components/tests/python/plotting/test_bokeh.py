import unittest
import uuid
from unittest.mock import patch

from bokeh.plotting import figure

from dara.components import Bokeh

test_uid = uuid.uuid4()


class TestBokehComponent(unittest.TestCase):
    """Test the Bokeh component"""

    def setUp(self):
        # Create a test figure
        x = [1, 2, 3, 4, 5]
        y = [6, 7, 2, 4, 5]
        self.fig = figure(title='simple line example', x_axis_label='x', y_axis_label='y')
        self.fig.line(x, y, line_width=2)

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serialises to a dict"""
        cmp = Bokeh(self.fig)
        expected_dict = {
            'name': 'Bokeh',
            'props': {
                'document': cmp.document,
                'bold': False,
                'italic': False,
                'underline': False,
            },
            'uid': str(test_uid),
        }
        self.assertEqual(cmp.dict(exclude_none=True), expected_dict)
