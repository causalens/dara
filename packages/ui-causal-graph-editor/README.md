# ui-causal-graph-editor

## Storybook

Due to bundling differences between Vite (used for Dara) and Webpack (used for Storybook currently),
running Storybook requires a manual change in `./src/shared/graph-layout/worker/client.ts` in
`LayoutWorker` constructor. Refer to the comment there.

Eventually we'll migrate to storybook's Vite builder but for now, this is the workaround.

