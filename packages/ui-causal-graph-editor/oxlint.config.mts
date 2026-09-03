import { defineConfig } from 'oxlint';

import daraConfig, { reactConfig, vitestConfig } from '@darajs/oxlint-config';

export default defineConfig({
    extends: [daraConfig, reactConfig],
    overrides: [
        {
            files: ['src/**/*.spec.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
            plugins: [...daraConfig.plugins, ...reactConfig.plugins, ...vitestConfig.plugins],
            rules: vitestConfig.rules,
        },
    ],
});
