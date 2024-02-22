from {{cookiecutter.__package_name}}.pages.components_page import components_page
from {{cookiecutter.__package_name}}.pages.intro_page import intro_page
from {{cookiecutter.__package_name}}.utils.template import template_renderer

from dara.core import ConfigurationBuilder
from dara.core.css import get_icon

# Create the configuration builder
config = ConfigurationBuilder()

# Add the template renderer to the configuration
config.add_template_renderer('side-bar', template_renderer)
config.template = 'side-bar'

# Add the pages to the configuration
config.add_page(name='Welcome', content=intro_page(), icon=get_icon('newspaper'))
config.add_page(name='A-Z Components', content=components_page(), icon=get_icon('spell-check'))
