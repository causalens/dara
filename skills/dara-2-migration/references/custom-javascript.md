# Custom JavaScript

## Components and actions

Resolve the implementation selected by each legacy `js_module` / `js_component` declaration and registration. Preserve Python class names, `py_component` / `py_name` overrides, aliases and inherited runtime identities. Keep existing explicit registrations; remove `local=True` after assigning the source.

Replace the legacy fields with a class-level source:

```python
from typing import ClassVar
from dara.core import ComponentInstance

class Gauge(ComponentInstance):
    js_source: ClassVar[str] = './js/gauge.tsx'
    value: float
```

Local sources must start with `./js/` and stay within that directory. Move sources and repair their imports when necessary. Published implementations use an npm subpath, for example `@example/widgets/gauge`.

Each selected module exports the implementation as its default export. Trace barrel re-exports to the real component or action. Prefer adding a default export to an owned implementation while retaining named exports needed by other consumers. If the implementation belongs to another package, use its supported public default-export subpath or upgrade that package. Keep a small re-export module only when an existing public API or shared implementation needs it.

Action subclasses of `ActionImpl` follow the same source contract. Preserve their Python `execute` behavior and serialized fields; their default JS export remains an `ActionHandler`. Existing `useVariable` and `useAction` hooks still decode serialized props. A source migration does not make those props ordinary React values.

## Setup and static assets

`js/index.tsx` is the application's setup module. Carry over global CSS imports and initialization side effects in their required order. Components load through their explicit source modules, so barrel exports alone no longer register them. Keep initialization dependencies explicit instead of relying on component barrel evaluation.

Replace generated library script tags and script-order settings with module imports. Keep genuinely static files at their existing public URLs. Application `static/` is served under `/static/`; package static assets use `/static/<python-module>/`. Update relative references when moving source files.

Vite configuration uses `defineConfig` and the plugin from `@darajs/vite-plugin`. Preserve ordinary plugins and aliases. Dara supplies the application entry, HTML and output publication. If a custom plugin reads extra files or environment variables, declare them through the Dara plugin's `inputs`, `directories` and `environment` options so freshness checks include them.

## Authentication UI

Inspect custom `AuthComponent` dictionaries as well as ordinary component classes. Replace their legacy JS selection with `js_source`, retaining `py_module` and the auth configuration's other fields. Give the login or logout UI a default-export source. Verify both authentication transitions in the application; rendering the ordinary page alone does not cover this branch.
