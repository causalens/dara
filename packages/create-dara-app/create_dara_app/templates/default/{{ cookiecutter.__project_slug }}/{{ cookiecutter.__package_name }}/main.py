from {{cookiecutter.__package_name}}.pages.components_page import components_page
from {{cookiecutter.__package_name}}.pages.intro_page import intro_page

from dara.core import ConfigurationBuilder, MenuLink, Outlet, SideBarFrame
from dara.core.css import get_icon

from dara.components import Icon, Stack, Text

# Create the configuration builder
config = ConfigurationBuilder()

# Root layout that displays a sidebar with links to the two pages
def RootLayout():
    return SideBarFrame(
        content=Outlet(),
        side_bar=Stack(
            MenuLink(
                Icon(icon=get_icon('newspaper')),
                Text('Welcome'),
                to='/',
            ),
            MenuLink(
                Icon(icon=get_icon('spell-check')),
                Text('A-Z Components'),
                to='/components',
            ),
        )
    )

# Add the layout and pages to the configuration
root = config.router.add_layout(content=RootLayout)
root.add_page(path='/', content=intro_page)
root.add_page(path='/components', content=components_page)

