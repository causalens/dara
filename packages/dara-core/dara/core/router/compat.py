from typing import List

from dara.core.definitions import ComponentInstance

from .components import Outlet
from .definitions import Router


def make_legacy_page_wrapper(content):
    def legacy_page_wrapper():
        return content

    return legacy_page_wrapper


def convert_template_to_router(template):
    """
    Convert old template system to new Router structure.

    The conversion maps:
    - Template.layout becomes the content of a root LayoutRoute, but with transformations:
      - RouterContent components are replaced with Outlet components
      - RouterContent.routes are extracted and become PageRoute/IndexRoute children
    - Routes with route='/' become IndexRoute, others become PageRoute
    - Route paths are normalized (leading slashes removed)

    :param template: Template object with layout component containing RouterContent
    :return: Router instance with converted structure
    """
    from dara.core.definitions import TemplateRouterContent
    from dara.core.visual.components.router_content import RouterContent

    router = Router()
    extracted_routes: List[TemplateRouterContent] = []

    # Transform the layout: replace RouterContent with Outlet and extract routes
    def transform_component(component):
        """Recursively transform components, replacing RouterContent with Outlet"""
        # For other components, recursively transform their children/content
        if isinstance(component, ComponentInstance):
            if isinstance(component, RouterContent):
                extracted_routes.extend(component.routes)
                return Outlet()

            for attr in component.model_fields_set:
                value = getattr(component, attr, None)
                if isinstance(value, ComponentInstance):
                    setattr(component, attr, transform_component(value))
                elif isinstance(value, list) and len(value) > 0 and isinstance(value[0], ComponentInstance):
                    setattr(component, attr, [transform_component(item) for item in value])

        return component

    # Transform the template layout
    transformed_layout = transform_component(template.layout)

    # Create a wrapper function for the transformed layout
    def layout_wrapper():
        return transformed_layout

    # Create root layout route using transformed template layout
    root_layout = router.add_layout(content=layout_wrapper)

    # Convert extracted routes to appropriate route types
    for route_content in extracted_routes:
        # Normalize route path: remove leading slash and handle root
        route_path = route_content.route
        if route_path.startswith('/'):
            route_path = route_path[1:]

        # the make_ function must be defined outside the lazy evaluation of loop variable issue
        legacy_page_wrapper = make_legacy_page_wrapper(route_content.content)

        # NOTE: here it's safe to use the name as the id, as in the old api the name was unique
        # but use 'index' for empty strings

        # Root path becomes index route
        if route_path in {'', '/'}:
            root_layout.add_index(
                content=legacy_page_wrapper,
                name=route_content.name,
                id=route_content.name or 'index',
                on_load=route_content.on_load,
            )
        else:
            root_layout.add_page(
                path=route_path,
                content=legacy_page_wrapper,
                name=route_content.name,
                id=route_content.name or 'index',
                on_load=route_content.on_load,
            )

    return router
