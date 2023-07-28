from dara.core.interactivity.actions import NavigateTo
from dara.components import Button, Card, Stack


def navigate_to():
    """
    Test the NavigateTo action
    """
    # Basic scenario
    navigate_basic = NavigateTo(url='/a_home')
    simple_scenario = Stack(Button('NAVIGATE_BASIC', onclick=navigate_basic))

    # Function scenario
    navigate_function = NavigateTo(url=lambda ctx: '/a_home')
    function_scenario = Stack(Button('NAVIGATE_FUNCTION', onclick=navigate_function))

    return Stack(Card(simple_scenario, title='Simple scenario'), Card(function_scenario, title='Function scenario'))
