import { defineConfig } from 'oxlint';

import daraConfig, { reactConfig, typeAwareOptions } from '@darajs/oxlint-config';

export default defineConfig({
    extends: [daraConfig, reactConfig],
    options: typeAwareOptions,
});
