import { defineConfig } from 'oxlint';

import rootConfig from './oxlint.config.mts';

/**
 * Non-build sources are excluded from the production tsconfigs, so reuse the
 * root rules without tsgo-backed rules or compiler diagnostics.
 */
export default defineConfig({
    extends: [rootConfig],
    options: {
        typeAware: false,
        typeCheck: false,
    },
});
