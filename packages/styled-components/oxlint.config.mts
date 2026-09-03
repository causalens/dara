import { defineConfig } from 'oxlint';

import daraConfig, { reactConfig } from '@darajs/oxlint-config';

export default defineConfig({
    extends: [daraConfig, reactConfig],
});
