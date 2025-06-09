from typing import Optional

from pydantic import SerializerFunctionWrapHandler, model_serializer

from .plain_variable import Variable


class ListItemVariable(AnyVariable):
    """
    A ListItemVariable is a Variable that represents an item in a list.
    It should be constructed using a parent Variable's `list_item()` method.
    It should only be used in conjunction with the `For` component.

    ```python
    from dara.core import Variable
    from dara.core.visual.components import For

    my_list = Variable([1, 2, 3])

    # Renders a list of Text component where each item is the corresponding item in the list
    For(
        items=my_list,
        renderer=Text(text=my_list.list_item())
    )
    ```
    """

    parent: Variable

    def __init__(self, parent: Variable, uid: Optional[str] = None):
        super().__init__(parent=parent, uid=uid)

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler):
        parent_dict = nxt(self.parent)
        return {**parent_dict, '__typename': 'ListVariable', 'uid': str(parent_dict['uid'])}
