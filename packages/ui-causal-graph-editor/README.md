# ui-causal-graph-editor

## Storybook

Due to bundling differences between Vite (used for Dara) and Webpack (used for Storybook currently),
running Storybook requires two manual changes:

1. In `./src/shared/graph-layout/worker/client.ts` in `LayoutWorker` constructor, swap out the line instantiating the worker. Refer to the comment there.
2. In `package.json`, remove the `"type": "module"` line.

These are temporary measures until we upgrade Storybook and migrate to storybook's Vite builder.

