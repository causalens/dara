import unittest
import uuid
from unittest.mock import patch

from dara.core.interactivity import UpdateVariable, Variable
from dara.components.common import Slider

test_uid = uuid.uuid4()


class TestSlider(unittest.TestCase):
    """
    Test the Slider component
    """

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_validation(self, _uid):
        var = Variable()

        # reversed min/max in domain
        with self.assertRaises(ValueError):
            Slider(domain=[2, 1], value=var)

        # too many items in domain
        with self.assertRaises(ValueError):
            Slider(domain=[1, 2, 3], value=var)

        # too few items in domain
        with self.assertRaises(ValueError):
            Slider(domain=[1], value=var)

        # not divisible - whole numbers
        with self.assertRaises(ValueError):
            Slider(domain=[0, 10], step=3, value=var)

        # not divisible - floats
        with self.assertRaises(ValueError):
            Slider(domain=[0.1, 0.9], step=0.25, value=var)

        # not divisible - scenario from the ticket
        with self.assertRaises(ValueError):
            Slider(domain=[0.025, 99.75], step=0.25, value=var)

        # check that those floating point scenarios don't raise exceptions due to floating point errors
        Slider(domain=[0.0, 1.0], step=0.01, value=var)
        Slider(domain=[-20.0, 20.0], step=0.05, value=var)
        Slider(domain=[0.0, 0.1], step=0.0001, value=var)
        Slider(domain=[-100, 100], step=0.02, value=var)
        Slider(domain=[0.5, 2.0], step=0.3, value=var)

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """
        Test the component serializes to a dict
        """
        value = Variable(default=[0.5])
        output = Variable()
        onchange = UpdateVariable(lambda ctx: ctx.inputs.new, variable=output)
        cmp = Slider(domain=[0, 1], value=value, onchange=onchange)
        expected_dict = {
            'name': 'Slider',
            'props': {
                'children': [],
                'domain': [0.0, 1.0],
                'rail_from_start': True,
                'rail_to_end': False,
                'value': value.dict(exclude_none=True),
                'disable_input_alternative': False,
                'onchange': onchange.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
