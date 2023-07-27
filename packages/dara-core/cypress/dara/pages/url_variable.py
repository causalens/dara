from dara.core.interactivity import UrlVariable
from dara.components import Card, Stack, Tab, TabbedCard, Text


def url_variable():
    """
    Test UrlVariable functionality.
    """
    url_var = UrlVariable('selected_tab', 'Tab1')

    simple_scenario = Stack(
        TabbedCard(
            Tab(Text('tab1 content'), title='Tab1'), Tab(Text('tab2 content'), title='Tab2'), selected_tab=url_var
        )
    )

    return Stack(Card(simple_scenario, title='Simple scenario'))
