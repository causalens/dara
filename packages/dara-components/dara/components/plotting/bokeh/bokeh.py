"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from json import dumps
from typing import Any, List, Optional, Tuple

from bokeh.document import Document
from bokeh.themes import Theme

from dara.components.plotting.bokeh.themes import light_theme
from dara.core.base_definitions import Action
from dara.core.definitions import StyledComponentInstance

SETTINGS = {'THEME': light_theme}


def _get_theme(theme_input: Optional[dict]):
    if theme_input is not None:
        return Theme(json=theme_input)
    else:
        return Theme(json=SETTINGS['THEME'])


class Bokeh(StyledComponentInstance):
    """
    A Bokeh Component allows for a bokeh figure to be added to your document. The component takes a single argument
    that should be the figure to display. The component takes care of serialization of the component using bokeh's
    Document class. A figure can only have 1 Document associated with it, so for this class to work you cannot have
    already associated the figure with a document (e.g. by calling show(figure)). If you need access to the Document
    then it is accessible as the document property of an instance of the Bokeh component. If you already have a document
    then you can instantiate the class with that, by passing it as the document argument to instantiate the class.
    """

    js_module = '@darajs/components'

    document: str
    events: Optional[List[Tuple[str, Action]]] = None

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {Document: lambda v: v.to_json()}
        use_enum_values = True

    def __init__(
        self,
        figure: Any = None,
        document: Any = None,
        theme: Optional[dict] = None,
        events: Optional[List[Tuple[str, Action]]] = None,
        **kwargs,
    ):
        """
        :param figure: the figure to display
        :param document: the document to display
        """
        if figure is not None:

            doc = Document()
            doc.theme = _get_theme(theme)
            doc.add_root(figure)
            document = doc

        if not isinstance(document, Document):
            raise ValueError(f'Bokeh component requires a Document instance, but got {type(document)}:\n{document}')

        document_dict = dumps(document.to_json(deferred=False))

        super().__init__(document=document_dict, events=events, **kwargs)


def set_default_bokeh_theme(theme: dict):
    SETTINGS['THEME'] = theme
