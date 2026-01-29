"""
LoopVariable in Variable.get() nested property E2E test page.

Tests using LoopVariable to dynamically access nested properties of a Variable inside a For loop.
"""

from dara.components import Button, Card, Input, Stack, Text
from dara.core import For, Variable, action
from dara.core.interactivity import ActionCtx


def loop_variable_nested():
    """LoopVariable nested property access E2E test page."""

    # ==================== BASIC DYNAMIC ACCESS ====================
    # A dictionary where keys come from loop items
    user_data = Variable({'user1': 'Alice', 'user2': 'Bob', 'user3': 'Charlie'})
    user_ids = Variable([{'id': 'user1'}, {'id': 'user2'}, {'id': 'user3'}])

    basic_section = Card(
        Stack(
            Text('User names accessed via dynamic key:'),
            For(
                items=user_ids,
                renderer=Stack(
                    Text(user_ids.list_item.get('id')),
                    Text(':'),
                    Text(user_data.get(user_ids.list_item.get('id'))),
                    direction='horizontal',
                    hug=True,
                ),
            ),
            hug=True,
        ),
        title='Basic Dynamic Access',
    )

    # ==================== EDITABLE DYNAMIC ACCESS ====================
    # Test that editing a dynamically-accessed nested value works
    editable_data = Variable({'item_a': 'Value A', 'item_b': 'Value B'})
    editable_items = Variable([{'key': 'item_a', 'label': 'Item A'}, {'key': 'item_b', 'label': 'Item B'}])

    editable_section = Card(
        Stack(
            Text('Editable values with dynamic keys:'),
            For(
                items=editable_items,
                renderer=Stack(
                    Text(editable_items.list_item.get('label')),
                    Text(':'),
                    Input(value=editable_data.get(editable_items.list_item.get('key'))),
                    direction='horizontal',
                    hug=True,
                ),
            ),
            Text('Current data object:'),
            Text(editable_data),
            hug=True,
        ),
        title='Editable Dynamic Access',
    )

    # ==================== DEEPLY NESTED ACCESS ====================
    # Test accessing deeply nested properties with mixed static and dynamic keys
    deep_data = Variable(
        {
            'categories': {
                'fruits': {'apple': 'Red', 'banana': 'Yellow'},
                'vegetables': {'carrot': 'Orange', 'lettuce': 'Green'},
            }
        }
    )
    category_items = Variable(
        [
            {'category': 'fruits', 'item': 'apple'},
            {'category': 'fruits', 'item': 'banana'},
            {'category': 'vegetables', 'item': 'carrot'},
            {'category': 'vegetables', 'item': 'lettuce'},
        ]
    )

    deep_section = Card(
        Stack(
            Text('Deeply nested access (static + dynamic keys):'),
            For(
                items=category_items,
                renderer=Stack(
                    Text(category_items.list_item.get('category')),
                    Text('/'),
                    Text(category_items.list_item.get('item')),
                    Text(':'),
                    Text(
                        deep_data.get('categories')
                        .get(category_items.list_item.get('category'))
                        .get(category_items.list_item.get('item'))
                    ),
                    direction='horizontal',
                    hug=True,
                ),
            ),
            hug=True,
        ),
        title='Deeply Nested Access',
    )

    # ==================== DYNAMIC LIST UPDATE ====================
    # Test that the For loop updates when the items list changes
    dynamic_data = Variable({'x': 'X Value', 'y': 'Y Value', 'z': 'Z Value'})
    dynamic_items = Variable([{'id': 'x'}])

    @action
    async def add_item(ctx: ActionCtx, items: list, data: dict):
        current_keys = {item['id'] for item in items}
        all_keys = set(data.keys())
        available = all_keys - current_keys
        if available:
            new_key = sorted(available)[0]
            await ctx.update(dynamic_items, [*items, {'id': new_key}])

    @action
    async def remove_item(ctx: ActionCtx, items: list):
        if len(items) > 0:
            await ctx.update(dynamic_items, items[:-1])

    @action
    async def reset_items(ctx: ActionCtx):
        await ctx.update(dynamic_items, [{'id': 'x'}])

    dynamic_section = Card(
        Stack(
            Stack(
                Button('Add Item', onclick=add_item(dynamic_items, dynamic_data)),
                Button('Remove Item', onclick=remove_item(dynamic_items)),
                Button('Reset', onclick=reset_items()),
                direction='horizontal',
                hug=True,
            ),
            Text('Dynamic list with dynamic key access:'),
            For(
                items=dynamic_items,
                renderer=Stack(
                    Text(dynamic_items.list_item.get('id')),
                    Text(':'),
                    Text(dynamic_data.get(dynamic_items.list_item.get('id'))),
                    direction='horizontal',
                    hug=True,
                ),
                placeholder=Text('No items'),
            ),
            hug=True,
        ),
        title='Dynamic List Update',
    )

    return Stack(basic_section, editable_section, deep_section, dynamic_section)
