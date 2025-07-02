import uuid

from dara.components import Button, Card, Stack, Text
from dara.core import action
from dara.core.interactivity import DerivedVariable, Variable
from dara.core.interactivity.actions import ActionCtx


def actions():
    """
    Action functionality test cases
    """
    dv = DerivedVariable(func=lambda: uuid.uuid4().hex, variables=[])
    target = Variable("null")

    @action
    async def set_target(ctx: ActionCtx, value):
        await ctx.update(target, value)

    cache_hit_scenario = Stack(
        Text("Input:"),
        Text(dv),
        Button("Set", onclick=set_target(dv)),
        Text("Target:"),
        Text(text=target),
    )

    return Stack(
        Card(cache_hit_scenario, title="Action Cache Hit"),
    )
