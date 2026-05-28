from dara.components import Card, CodeEditor, Heading, Markdown, Stack
from dara.core import ComponentInstance, Variable

markdown_script = Variable(
    """# Markdown Editor QA

| Area | Status |
| --- | --- |
| Code editor | Loaded |
| Markdown renderer | Loaded |

```python
def render_markdown() -> str:
    return "ok"
```

- Edit this markdown to verify the editor remains interactive.
- The rendered preview below should update with the same content.
"""
)


def markdown_editor_page() -> ComponentInstance:
    return Stack(
        Heading('Markdown Code Editor QA'),
        Card(
            CodeEditor(
                script=markdown_script,
                language='markdown',
                min_height='320px',
            ),
            title='CodeEditor',
        ),
        Card(
            Markdown(markdown_script),
            title='Markdown Preview',
        ),
    )
