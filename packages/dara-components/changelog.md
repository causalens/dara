---
title: Changelog
---

## NEXT

-   Fixed an issue where it was hard to persist table selection. Now the index is also returned to `onclick_row`

```python
selected_row = Variable([1])

def updatetable(ctx):
    indexes = [d['__index__'] for d in ctx.inputs.new]
    return indexes

def table() -> ComponentInstance:
    return Table(
        columns=columns,
        data=data,
        # Save selected indices to a Variable and update it based onclick_row
        selected_indices=selected_row,
        show_checkboxes=True,
        onclick_row=UpdateVariable(updatetable, selected_row),
    )
```

## 1.0.1

-   Fixed an issue where `Switch` would not be aligned by default with other components
-   Fixed an issue where `Select` did not accept `items` containing a `DerivedVariable` with a list of strings.
## 1.0.0-a.1

-   Initial release
