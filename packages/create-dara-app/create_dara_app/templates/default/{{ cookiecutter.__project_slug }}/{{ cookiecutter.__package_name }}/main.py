from {{cookiecutter.__package_name}}.pages.components_page import components_page
from {{cookiecutter.__package_name}}.pages.intro_page import intro_page

from dara.core import ConfigurationBuilder
from dara.core.configuration import Configuration
from dara.core.css import get_icon
from dara.core.visual.components import Menu, RouterContent
from dara.core.visual.components.sidebar_frame import SideBarFrame
from dara.core.visual.template import TemplateBuilder
from dara.core.visual.themes import Light

# Create the configuration builder
config = ConfigurationBuilder()

def template_renderer(config: Configuration):
    builder = TemplateBuilder(name='side-bar')

    # Using the TemplateBuilder's helper method - add_router_from_pages
    # to construct a router of page definitions
    router = builder.add_router_from_pages(list(config.pages.values()))

    builder.layout = SideBarFrame(
        content=RouterContent(routes=router.content),
        side_bar=Menu(routes=router.links),
        logo_path='/static/dara_light.svg',
    )

    return builder.to_template()

config.add_template_renderer('side-bar', template_renderer)
config.template = 'side-bar'

config.add_page(name='Welcome', content=intro_page(), icon=get_icon('newspaper'))
config.add_page(name='A-Z Components', content=components_page(), icon=get_icon('spell-check'))
