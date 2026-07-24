import { defineConfig } from 'oxlint';

import daraConfig, { reactConfig } from '@darajs/oxlint-config';

/**
 * Tests, stories, and Cypress files are excluded from the production tsconfigs,
 * so lint them without tsgo-backed rules or compiler diagnostics.
 */
export default defineConfig({
    extends: [daraConfig, reactConfig],
});
