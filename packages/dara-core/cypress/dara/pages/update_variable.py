from dara.core.interactivity import DerivedVariable, UpdateVariable, Variable
from dara.components import Button, Card, Stack, Text

from cypress.dara.tasks import add_one, add_two


def update_variable():
    """
    Test UpdateVariable action.

    Simple scenarios use a plain variable for extra. Complex scenarios have a DerivedVariable in extras,
    where the DerivedVariable is not included elsewhere in the page - only in UpdateVariable extras.
    """
    # Simple scenario
    simple_result = Variable(0)
    simple_scenario = Stack(
        Text('SIMPLE_RESULT:'),
        Text(simple_result),
        Button('SIMPLE_UPDATE', onclick=UpdateVariable(lambda ctx: 5, variable=simple_result)),
    )

    # Scenario with extras, mix of DV and Var
    simple_extra_result = Variable(0)
    simple_extra = Variable(1)
    simple_extra_scenario = Stack(
        Text('SIMPLE_EXTRA_RESULT:'),
        Text(simple_extra_result),
        Button(
            'SIMPLE_EXTRA_UPDATE',
            onclick=UpdateVariable(lambda ctx: ctx.extras[0], variable=simple_extra_result, extras=[simple_extra]),
        ),
    )

    # Scenario with single extra DV task
    to_add = Variable(1)
    single_dv_result = Variable(0)
    single_dv = DerivedVariable(add_one, variables=[to_add])
    single_dv_scenario = Stack(
        Text('SINGLE_DV_RESULT:'),
        Text(single_dv_result),
        Button(
            'SINGLE_DV_UPDATE',
            onclick=UpdateVariable(lambda ctx: ctx.extras[0], variable=single_dv_result, extras=[single_dv]),
        ),
    )

    # Scenario with multiple extra DV tasks
    multi_dv_result = Variable(0)
    multi_dv_1 = DerivedVariable(add_one, variables=[to_add])
    multi_dv_2 = DerivedVariable(add_two, variables=[to_add])
    multi_dv_scenario = Stack(
        Text('MULTI_DV_RESULT:'),
        Text(multi_dv_result),
        Button(
            'MULTI_DV_UPDATE',
            onclick=UpdateVariable(
                lambda ctx: ctx.extras[0] + ctx.extras[1], variable=multi_dv_result, extras=[multi_dv_1, multi_dv_2]
            ),
        ),
    )

    # Scenario with sequential updates (verifying multiple actions on one handler)
    seq_result_1 = Variable(1)
    seq_result_2 = Variable(2)
    seq_scenario = Stack(
        Text('SEQ_RESULT_1:'),
        Text(seq_result_1),
        Text('SEQ_RESULT_2:'),
        Text(seq_result_2),
        Button(
            'SEQ_UPDATE',
            onclick=[
                UpdateVariable(lambda ctx: 4, variable=seq_result_1),
                UpdateVariable(lambda ctx: 5, variable=seq_result_2),
            ],
        ),
    )

    # Scenario with sequential increment (verifying action retrieves up-to-date value)
    inc_var = Variable(1)
    inc_scenario = Stack(
        Text('INC_RESULT:'),
        Text(inc_var),
        Button('INC_UPDATE', onclick=UpdateVariable(lambda ctx: int(ctx.inputs.old) + 1, variable=inc_var)),
    )

    return Stack(
        Card(simple_scenario, title='Simple scenario'),
        Card(simple_extra_scenario, title='Simple extra scenario'),
        Card(single_dv_scenario, title='Single DV scenario'),
        Card(multi_dv_scenario, title='Multi DV scenario'),
        Card(seq_scenario, title='Sequential scenario'),
        Card(inc_scenario, title='Increment scenario'),
        raw_css="""
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
        """,
    )
