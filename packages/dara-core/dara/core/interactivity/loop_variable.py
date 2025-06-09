from typing import List, Optional

from pydantic import Field, SerializerFunctionWrapHandler, model_serializer

from .any_variable import AnyVariable
from .plain_variable import Variable


class LoopVariable(AnyVariable):
    """
    A LoopVariable is a type of variable that represents an item in a list.
    It should be constructed using a parent Variable's `list_item()` method.
    It should only be used in conjunction with the `For` component.

    By default, the entire value is used as the item and the index in the list is used as the unique key.

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

    Most of the time, you'll want to store objects in a list. You should then use the `get` property to access specific
    properties of the object and the `key` on the `For` component to specify the unique key.

    ```python
    from dara.core import Variable
    from dara.core.visual.components import For

    my_list = Variable([{'id': 1, 'name': 'John', 'age': 30}, {'id': 2, 'name': 'Jane', 'age': 25}])

    # Renders a list of Text component where each item is the corresponding item in the list
    For(
        items=my_list,
        renderer=Text(text=my_list.list_item().get('name')),
        key='id'
    )
    """

    parent: Variable
    nested: List[str] = Field(default_factory=list)

    def __init__(self, parent: Variable, uid: Optional[str] = None, nested: Optional[List[str]] = None):
        super().__init__(parent=parent, uid=uid, nested=nested)

    def get(self, key: str):
        return self.model_copy(update={'nested': [*self.nested, key]}, deep=True)

    def __getitem__(self, key: str):
        return self.get(key)

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler):
        parent_dict = nxt(self.parent)
        return {**parent_dict, '__typename': 'LoopVariable', 'uid': str(parent_dict['uid'])}
