import os

from dara.components import Icon, Stack, Text
from dara.core import ConfigurationBuilder, MenuLink, Outlet, SideBarFrame
from dara.core.css import get_icon

from demo_app.pages.components_page import components_page
from demo_app.pages.download_xlsx_page import download_xlsx_page
from demo_app.pages.intro_page import intro_page
from demo_app.pages.markdown_editor_page import markdown_editor_page
from demo_app.pages.plotting_assets_page import plotting_assets_page
from demo_app.pages.polling_page import polling_page

# Create the configuration builder
config = ConfigurationBuilder()

if os.getenv('DARA_DEMO_AUTH') == 'oidc':
    from dara.core.auth.oidc import OIDCAuthConfig

    config.auth_config = OIDCAuthConfig()


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
            MenuLink(
                Icon(icon=get_icon('clock')),
                Text('Polling Demo'),
                to='/polling',
            ),
            MenuLink(
                Icon(icon=get_icon('download')),
                Text('Download XLSX QA'),
                to='/download-xlsx',
            ),
            MenuLink(
                Icon(icon=get_icon('chart-line')),
                Text('Plotting QA'),
                to='/plotting-assets',
            ),
            MenuLink(
                Icon(icon=get_icon('code')),
                Text('Markdown Editor QA'),
                to='/markdown-editor',
            ),
        ),
    )


# Add the layout and pages to the configuration
root = config.router.add_layout(content=RootLayout)
root.add_page(path='/', content=intro_page)
root.add_page(path='/components', content=components_page)
root.add_page(path='/polling', content=polling_page)
root.add_page(path='/download-xlsx', content=download_xlsx_page)
root.add_page(path='/plotting-assets', content=plotting_assets_page)
root.add_page(path='/markdown-editor', content=markdown_editor_page)
