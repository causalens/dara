import unittest
import uuid
from decimal import Decimal
from unittest.mock import patch

from dara.components.common.slider import Slider, compute_step
from dara.core.interactivity import UpdateVariable, Variable

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

        # not divisible, inferred step - scenario from a bug report
        with self.assertRaises(ValueError):
            Slider(domain=[31635, 70876], value=var)

        # check that those floating point scenarios don't raise exceptions due to floating point errors
        # check with an explicit step and inferred step
        Slider(domain=[0.0, 1.0], step=0.01, value=var)
        Slider(domain=[0.0, 1.0], value=var)

        Slider(domain=[-20.0, 20.0], step=0.05, value=var)
        Slider(domain=[-20.0, 20.0], value=var)

        Slider(domain=[0.0, 0.1], step=0.0001, value=var)
        Slider(domain=[0.0, 0.1], value=var)

        Slider(domain=[-100, 100], step=0.02, value=var)
        Slider(domain=[-100, 100], value=var)

        Slider(domain=[0.5, 2.0], step=0.3, value=var)
        Slider(domain=[0.5, 2.0], value=var)

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_inferred_step(self, _uid):
        """
        Test the step inference logic for various domain ranges
        """
        var = Variable()

        # Test with large integer domain - not a valid range
        with self.assertRaises(ValueError):
            slider = Slider(domain=[12344, 38756], value=var)
        # Still check the inference logic, for this range (26412), the inferred step should be 1000
        self.assertEqual(compute_step(Decimal('26412')), Decimal('1000'))

        # Test with small decimal domain
        slider = Slider(domain=[0.0025, 0.0075], value=var)
        # For this range (0.005), the inferred step should be 0.0001
        self.assertEqual(compute_step(Decimal('0.005')), Decimal('0.0001'))

        # Test with negative domain
        slider = Slider(domain=[-5000, -1000], value=var)
        # For this range (4000), the inferred step should be 100
        self.assertEqual(compute_step(Decimal('4000')), Decimal('100'))

        # Test with very large domain
        slider = Slider(domain=[1000000, 9000000], value=var)
        # For this range (8000000), the inferred step should be 100000
        self.assertEqual(compute_step(Decimal('8000000')), Decimal('100000'))

        # Test with very small domain
        slider = Slider(domain=[0.000001, 0.000009], value=var)
        # For this range (0.000008), the inferred step should be 0.0000001
        self.assertEqual(compute_step(Decimal('0.000008')), Decimal('0.0000001'))

    def test_compute_step_edge_cases(self):
        """
        Test edge cases for the compute_step function
        """
        # Test with exactly 1.0
        self.assertEqual(compute_step(Decimal('1.0')), Decimal('0.1'))

        # Test with exactly 10.0
        self.assertEqual(compute_step(Decimal('10.0')), Decimal('1'))

        # Test with exactly 0.1
        self.assertEqual(compute_step(Decimal('0.1')), Decimal('0.01'))

        # Test with negative input (should raise ValueError)
        with self.assertRaises(ValueError):
            compute_step(Decimal('-1.0'))

        # Test with zero input (should raise ValueError)
        with self.assertRaises(ValueError):
            compute_step(Decimal('0'))

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
                'bold': False,
                'children': [],
                'domain': [0.0, 1.0],
                'italic': False,
                'rail_from_start': True,
                'rail_to_end': False,
                'underline': False,
                'value': value.dict(exclude_none=True),
                'disable_input_alternative': False,
                'onchange': onchange.dict(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.dict(exclude_none=True), expected_dict)
