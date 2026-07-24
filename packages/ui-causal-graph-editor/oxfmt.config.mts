import daraConfig from '@darajs/oxfmt-config';
import { defineConfig } from 'oxfmt';

export default defineConfig({
    ...daraConfig,
    ignorePatterns: ['src/pixi.d.ts'],
});
