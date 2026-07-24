import { defineConfig } from 'oxlint';

import daraConfig, { reactConfig } from '@darajs/oxlint-config';

export default defineConfig({
    extends: [daraConfig, reactConfig],
    ignorePatterns: [
        '**/*.spec.tsx',
        '**/*.stories.tsx',
        '**/src/packages/ui-causal-graph/graph-viewer/utils/stories-utils.tsx',
        'src/pixi.d.ts',
    ],
});
