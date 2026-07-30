from datetime import datetime, timezone

from opentelemetry import trace

from dara.components import Button, Card, Heading, Label, Select, Spacer, Stack, Text
from dara.core import ComponentInstance, DerivedVariable, SwitchVariable, Variable, action, py_component

tracer = trace.get_tracer(__name__)

polling_mode = Variable('2s')
action_count = Variable(0)

polling_interval = SwitchVariable.match(
    value=polling_mode,
    mapping={
        'off': None,
        '1s': 1,
        '2s': 2,
        '5s': 5,
    },
    default=2,
)

polling_mode_label = SwitchVariable.match(
    value=polling_mode,
    mapping={
        'off': 'disabled',
        '1s': '1 second',
        '2s': '2 seconds',
        '5s': '5 seconds',
    },
    default='2 seconds',
)

server_time_dv = DerivedVariable(
    func=lambda: datetime.now(timezone.utc).isoformat(timespec='milliseconds'),
    variables=[],
    polling_interval=polling_interval,
)


@action
async def increment_demo_counter(ctx: action.Ctx, current_count: int) -> None:
    """Increment the demo counter inside an application-defined OTEL span."""
    with tracer.start_as_current_span('demo.action.increment_counter') as span:
        span.set_attribute('demo.operation', 'increment_counter')
        await ctx.update(action_count, current_count + 1)
        span.add_event('demo.counter.incremented')


@py_component(polling_interval=polling_interval)
def server_time_py_component() -> ComponentInstance:
    return Text(datetime.now(timezone.utc).isoformat(timespec='milliseconds'))


def polling_page() -> ComponentInstance:
    return Stack(
        Heading('Dynamic Polling Interval Demo'),
        Text(
            'Open browser DevTools > Network and filter by "/api/core/derived-variable/" and "/api/core/components/".'
        ),
        Text('Change the interval below to see the polling requests speed up, slow down, or stop when set to "off".'),
        Spacer(height='0.5rem'),
        Label(
            Select(
                items=['off', '1s', '2s', '5s'],
                value=polling_mode,
            ),
            value='Polling interval:',
        ),
        Text(text=polling_mode_label),
        Spacer(line=True),
        Card(
            Stack(
                Text('DerivedVariable value (server timestamp):'),
                Text(text=server_time_dv),
            ),
            title='DerivedVariable Polling',
        ),
        Card(
            Stack(
                Text('py_component value (server timestamp):'),
                server_time_py_component(),
            ),
            title='py_component Polling',
        ),
        Card(
            Stack(
                Text('Runs a server-side @action with a custom child span and increments the counter below.'),
                Button('Run instrumented action', onclick=increment_demo_counter(action_count)),
                Stack(
                    Text('Completed runs:'),
                    Text(text=action_count),
                    direction='horizontal',
                ),
            ),
            title='Action and Custom Span',
        ),
    )
