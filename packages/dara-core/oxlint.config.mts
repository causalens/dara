import { defineConfig } from 'oxlint';

import daraConfig, { reactConfig, vitestConfig } from '@darajs/oxlint-config';

export default defineConfig({
    extends: [daraConfig, reactConfig],
    ignorePatterns: ['**/*.template.tsx'],
    overrides: [
        {
            files: ['tests/**/*.{ts,tsx}', 'js/**/*.spec.{ts,tsx}'],
            plugins: [...daraConfig.plugins, ...reactConfig.plugins, ...vitestConfig.plugins],
            rules: vitestConfig.rules,
        },
    ],
});
