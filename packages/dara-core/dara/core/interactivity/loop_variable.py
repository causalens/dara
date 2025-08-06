from typing import List, Optional

from pydantic import Field, SerializerFunctionWrapHandler, model_serializer

from .client_variable import ClientVariable


class LoopVariable(ClientVariable):
    """
    A LoopVariable is a type of variable that represents an item in a list.
    It should be constructed using a parent Variable's `.list_item` property.
    It should only be used in conjunction with the `For` component.

    By default, the entire value is used as the item and the index in the list is used as the unique key.

    ```python
    from dara.core import Variable
    from dara.core.visual.components import For

    my_list = Variable([1, 2, 3])

    # Renders a list of Text component where each item is the corresponding item in the list
    For(
        items=my_list,
        renderer=Text(text=my_list.list_item)
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
        renderer=Text(text=my_list.list_item.get('name')),
        key_accessor='id'
    )
    ```

    Alternatively, you can use index access instead of `get` to access specific properties of the object.
    Both `get` and `[]` are equivalent.
    """

    nested: List[str] = Field(default_factory=list)

    def __init__(self, uid: Optional[str] = None, nested: Optional[List[str]] = None):
        if nested is None:
            nested = []
        super().__init__(uid=uid, nested=nested)

    def get(self, key: str):
        """
        Access a nested property of the current item in the list.

        ```python
        from dara.core import Variable

        my_list_of_objects = Variable([
            {'id': 1, 'name': 'John', 'data': {'city': 'London', 'country': 'UK'}},
            {'id': 2, 'name': 'Jane', 'data': {'city': 'Paris', 'country': 'France'}},
        ])

        # Represents the item 'name' property
        my_list_of_objects.list_item.get('name')

        # Represents the item 'data.country' property
        my_list_of_objects.list_item.get('data').get('country')
        ```
        """
        return self.model_copy(update={'nested': [*self.nested, key]}, deep=True)

    def __getitem__(self, key: str):
        return self.get(key)

    @property
    def list_item(self):
        raise RuntimeError('LoopVariable does not support list_item')

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler):
        parent_dict = nxt(self)
        return {**parent_dict, '__typename': 'LoopVariable', 'uid': str(parent_dict['uid'])}
