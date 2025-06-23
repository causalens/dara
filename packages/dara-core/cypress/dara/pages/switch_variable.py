from dara.components import Button, Card, Input, Select, Stack, Text
from dara.core import py_component
from dara.core.interactivity import DerivedVariable, SwitchVariable, Variable


def switch_variable():
    """
    SwitchVariable functionality test cases
    """

    # 1. Simple boolean switch with button toggle (when, variable->true/false values)
    is_admin = Variable(default=False)
    admin_ui = SwitchVariable.when(condition=is_admin, true_value='Admin Panel', false_value='User Panel')

    simple_boolean_scenario = Stack(
        Text('Current Status:'),
        Text(
            text=admin_ui,
        ),
        Button(
            'Toggle Admin',
            onclick=is_admin.toggle(),
        ),
    )

    # 2. Value mapping with select dropdown (match, value->mapping)
    user_role = Variable(default='guest')
    permissions = SwitchVariable.match(
        value=user_role,
        mapping={'admin': 'Full Access', 'editor': 'Write Access', 'viewer': 'Read Access', 'guest': 'No Access'},
        default='Unknown Access',
    )

    value_mapping_scenario = Stack(
        Text('Select Role:'),
        Select(
            items=['guest', 'viewer', 'editor', 'admin', 'unknown'],
            value=user_role,
        ),
        Text('Permissions:'),
        Text(
            text=permissions,
        ),
    )

    # 3. Complex condition with numeric comparison (when, condition->true/false values)
    score = Variable(default=85)
    grade = SwitchVariable.when(condition=score >= 90, true_value='A Grade', false_value='B Grade')

    complex_condition_scenario = Stack(
        Text('Score:'), Input(value=score, type='number'), Text('Grade (>=90 = A, <90 = B):'), Text(text=grade)
    )

    # 4. Switch variable in derived variable
    temperature = Variable(default=20)
    weather_advice = SwitchVariable.when(
        condition=temperature > 25, true_value='Wear light clothes', false_value='Wear warm clothes'
    )

    # Create a derived variable that uses the switch variable
    full_weather_report = DerivedVariable(
        func=lambda temp, advice: f'Temperature: {temp}°C - {advice}', variables=[temperature, weather_advice]
    )

    derived_variable_scenario = Stack(
        Text('Temperature (°C):'),
        Input(value=temperature, type='number'),
        Text('Weather Report:'),
        Text(text=full_weather_report),
    )

    # 5. Switch variable with variable mapping
    theme_preference = Variable(default='auto')
    theme_mapping_var = Variable({'auto': 'System Theme', 'light': 'Light Theme', 'dark': 'Dark Theme'})

    active_theme = SwitchVariable.match(value=theme_preference, mapping=theme_mapping_var, default='Unknown Theme')

    variable_mapping_scenario = Stack(
        Text('Theme Preference:'),
        Select(
            items=['auto', 'light', 'dark', 'custom'],
            value=theme_preference,
        ),
        Text('Active Theme:'),
        Text(
            text=active_theme,
        ),
    )

    # 6. Switch variable with multiple conditions (using DerivedVariable approach)
    user_type = Variable(default='free')
    feature_enabled = Variable(default=True)

    # Create a derived variable that combines both conditions
    combined_status = DerivedVariable(
        func=lambda user, enabled: f'{user}_{enabled}', variables=[user_type, feature_enabled]
    )

    # Single switch that handles all combinations
    final_features = SwitchVariable.match(
        value=combined_status,
        mapping={
            'free_True': 'Basic Features',
            'premium_True': 'Premium Features',
            'enterprise_True': 'Enterprise Features',
            'free_False': 'Features Disabled',
            'premium_False': 'Features Disabled',
            'enterprise_False': 'Features Disabled',
        },
        default='No Features',
    )

    nested_switch_scenario = Stack(
        Text('User Type:'),
        Select(
            items=['free', 'premium', 'enterprise'],
            value=user_type,
        ),
        Text('Features Enabled:'),
        Button('Toggle Features', onclick=feature_enabled.toggle()),
        Text('Available Features:'),
        Text(
            text=final_features,
        ),
    )

    # 7. Switch variable as an input to a py_component
    status_var = Variable(default='loading')
    status_message = SwitchVariable.match(
        value=status_var,
        mapping={
            'loading': 'Please wait...',
            'success': 'Operation completed!',
            'error': 'Something went wrong',
            'cancelled': 'Operation was cancelled',
        },
        default='Unknown status',
    )

    @py_component
    def status_component(status_msg):
        return Stack(
            Text('Status Message:'),
            Text(
                text=status_msg,
            ),
        )

    py_component_scenario = Stack(
        Text('Status:'),
        Select(
            items=['loading', 'success', 'error', 'cancelled', 'unknown'],
            value=status_var,
        ),
        status_component(status_message),
    )

    # 8. Switch variable as dependency of derived variable passed to py_component (server-side resolution)
    priority_level = Variable(default=1)
    urgency_switch = SwitchVariable.match(
        value=priority_level,
        mapping={
            1: 'Low',
            2: 'Medium',
            3: 'High',
            4: 'Critical',
        },
        default='Unknown',
    )

    # DerivedVariable that depends on the switch variable
    task_summary = DerivedVariable(
        func=lambda priority, level: f'Task Priority: {priority} (Level {level})',
        variables=[urgency_switch, priority_level],
    )

    @py_component
    def task_display(summary):
        return Stack(
            Text('Task Summary:'),
            Text(text=summary),
        )

    server_side_resolution_scenario = Stack(
        Text('Priority Level (1-4):'),
        Input(value=priority_level, type='number'),
        task_display(task_summary),
    )

    return Stack(
        Card(simple_boolean_scenario, title='Simple Boolean Switch'),
        Card(value_mapping_scenario, title='Value Mapping'),
        Card(complex_condition_scenario, title='Complex Condition'),
        Card(derived_variable_scenario, title='Switch in Derived Variable'),
        Card(variable_mapping_scenario, title='Variable Mapping'),
        Card(nested_switch_scenario, title='Switch Variable with Multiple Conditions'),
        Card(py_component_scenario, title='Switch in Py Component'),
        Card(server_side_resolution_scenario, title='Switch->DV->PyComponent (Server-side)'),
    )
