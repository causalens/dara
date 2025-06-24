import inspect
import os
from importlib import import_module

import dara.components as dashboarding_components
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance

config = ConfigurationBuilder()
config.template = 'default'
config.task_module = 'cypress.dara.tasks'

# Explicitly add all dashboarding components since we're dynamically importing pages, so auto-discovery won't work
for symbol in dashboarding_components.__dict__.values():
    if inspect.isclass(symbol) and issubclass(symbol, ComponentInstance):
        config.add_component(symbol)


# Loop through pages and register all of them
file_dir = os.path.dirname(__file__)

files = sorted(os.listdir(os.path.join(file_dir, 'pages')))

for f in files:
    if os.path.isfile(os.path.join(file_dir, 'pages', f)):
        filename = os.path.splitext(f)[0]

        # Assume the page exposes a method with the same name as the page which takes no arguments
        page_module = import_module(f'cypress.dara.pages.{filename}')
        page_func = getattr(page_module, filename)

        # Set which variables should be reset if set
        variables_to_reset = getattr(page_module, '__reset_variables', [])

        config.add_page(filename, page_func(), reset_vars_on_load=variables_to_reset)
