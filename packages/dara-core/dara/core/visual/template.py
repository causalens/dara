"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

from typing import List, Optional

from dara.core.base_definitions import Action
from dara.core.definitions import (
    ComponentInstance,
    Page,
    Template,
    TemplateRoute,
    TemplateRouterContent,
    TemplateRouterLink,
)


class TemplateRouter:
    """
    The TemplateRouter is a python based representation of the router that serializes into a structure that is read into
    the javascript routing components to build out the routing
    """

    def __init__(self):
        self._routes: List[TemplateRoute] = []

    def add_route(
        self,
        name: str,
        route: str,
        content: ComponentInstance,
        icon: Optional[str] = None,
        include_in_menu: Optional[bool] = True,
        on_load: Optional[Action] = None,
    ):
        """
        Add a single route to the router.

        :param name: the name for the route (what will be displayed on links to the page)
        :param route: the url for the route
        :param content: a component instance to display when this route is active
        :param icon: an optional icon to display with the link
        :param include_in_menu: an optional flag for not including the route in the links
        """
        template_route = TemplateRoute(
            name=name,
            route=route,
            content=content,
            icon=icon,
            include_in_menu=include_in_menu,
            on_load=on_load,
        )
        self._routes.append(template_route)
        return template_route

    @property
    def links(self):
        """
        Return the router as a set of links for the UI to consume
        """
        router_links = []
        for r in self._routes:
            if r.include_in_menu or r.include_in_menu is None:
                router_links.append(TemplateRouterLink(name=r.name, route=r.route, icon=r.icon))
        return router_links

    @property
    def content(self):
        """
        Return the router as a set of content pages for the UI to consume
        """
        return [
            TemplateRouterContent(route=r.route, content=r.content, on_load=r.on_load, name=r.name)
            for r in self._routes
        ]

    @staticmethod
    def from_pages(pages: List[Page]):
        """
        Create a template router from a list of page objects

        :param pages: the list of pages
        """
        router = TemplateRouter()
        for page in pages:
            route = page.url_safe_name if page.url_safe_name.startswith('/') else f'/{page.url_safe_name}'
            # If a page is callable, then instantiate it at this point as the registries will have been filled.
            content = page.content() if callable(page.content) else page.content
            router.add_route(
                name=page.name,
                icon=page.icon,
                route=route,
                content=content,
                include_in_menu=page.include_in_menu,
                on_load=page.on_load,
            )
        return router


class TemplateBuilder:
    """
    The TemplateBuilder class lets you build a Template object up piece by piece using helper methods that
    aid setup and point users in the right direction. Before passing it into the main application you should call
    to_template() to perform final validation and build the Template object.
    """

    layout: Optional[ComponentInstance]
    name: Optional[str]
    _router: Optional[TemplateRouter]

    def __init__(self, name: Optional[str] = None):
        """
        :param name: the name for the template
        """
        self.layout = None
        self.name = name
        self._router = None

    def add_router(self):
        """
        Add a router to the template. The router instance is returned and can then be configured as the user wishes.
        Currently each template can only have one router registered with it.
        """
        if self._router is not None:
            raise ValueError('Router has already been created. A template can only have one router')
        self._router = TemplateRouter()
        return self._router

    def add_router_from_pages(self, pages: List[Page]):
        """
        Add a router to the template based on an apps pages. The router instance is returned and can then be configured
        as the user wishes. Currently each template can only have one router registered with it.
        """
        if self._router is not None:
            raise ValueError('Router has already been created. A template can only have one router')
        self._router = TemplateRouter.from_pages(pages)
        return self._router

    def to_template(self):
        """
        Perform final validation and convert the TemplateBuilder to a Template class ready for the application to work
        from.
        """
        if self.name is None:
            raise ValueError('Template requires a name to be set, so it can be referenced from the configuration')
        if self.layout is None:
            raise ValueError('Template requires a root layout component to be set.')
        return Template(layout=self.layout, name=self.name)
