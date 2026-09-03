import { defineConfig } from 'oxlint';

import daraConfig, { reactConfig, typeAwareOptions, vitestConfig } from '@darajs/oxlint-config';

export default defineConfig({
    extends: [daraConfig, reactConfig],
    options: typeAwareOptions,
    overrides: [
        {
            files: [
                'packages/dara-core/tests/**/*.{ts,tsx}',
                'packages/{dara-components,dara-core}/js/**/*.spec.{ts,tsx}',
                'packages/{styled-components,ui-*}/src/**/*.spec.{ts,tsx}',
                'packages/ui-causal-graph-editor/tests/**/*.{ts,tsx}',
            ],
            plugins: [...daraConfig.plugins, ...reactConfig.plugins, ...vitestConfig.plugins],
            rules: vitestConfig.rules,
        },
    ],
});
