import time

from dara.components import Button, Card, If, Stack, Text
from dara.core.interactivity import DerivedVariable, Variable


def state_variable():
    """
    StateVariable e2e test page.

    Tests the three StateVariable properties:
    - is_loading: shows when DerivedVariable is calculating
    - has_error: shows when calculation fails
    - has_value: shows when calculation succeeds
    """

    # Control variable to determine success/failure
    should_succeed = Variable(True)

    async def slow_calculation(success: bool):
        """Intentionally slow calculation that can succeed or fail"""
        import asyncio

        await asyncio.sleep(3)  # Simulate slow operation

        if success:
            return 'Calculation completed successfully!'
        else:
            raise ValueError('Calculation failed as requested')

    # DerivedVariable that will be slow and can succeed/fail
    result = DerivedVariable(slow_calculation, variables=[should_succeed], cache=None)

    # StateVariable instances for tracking state
    loading_state = result.is_loading
    error_state = result.has_error
    success_state = result.has_value

    return Stack(
        Card(
            Stack(
                Text('StateVariable E2E Test', bold=True),
                Text('Click buttons to trigger calculations that succeed or fail:'),
                # Control buttons
                Stack(
                    Button('Trigger Success', onclick=should_succeed.update(True)),
                    Button('Trigger Failure', onclick=should_succeed.update(False)),
                    direction='horizontal',
                    gap='1rem',
                ),
                # State indicators using If components
                If(loading_state, Text('🔄 Loading... Please wait', color='blue')),
                If(error_state, Text('❌ Error occurred during calculation', color='red')),
                If(
                    success_state,
                    Stack(
                        Text('✅ Calculation successful!', color='green'),
                        Text('Result:'),
                        Text(result),
                    ),
                ),
                gap='1rem',
            ),
            title='StateVariable State Tracking',
        )
    )
