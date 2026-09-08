import react from '@vitejs/plugin-react';
import { URL, fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
    plugins: [react({ jsxRuntime: 'classic' })],
    define: {
        'process.env.NODE_ENV': mode === 'test' ? '"test"' : '"production"',
    },
    resolve: {
        alias: [{ find: '@', replacement: fileURLToPath(new URL('./js', import.meta.url)) }],
    },
    test: {
        include: ['./tests/js/**/*.(test|spec).ts(x)'],
        // makes Vitest work like Jest where `test`/`describe` are global
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./js/vitest-setup.ts'],
        server: {
            deps: {
                // see https://github.com/styled-components/styled-components/issues/4268
                // and https://github.com/vitest-dev/vitest/discussions/5286
                inline: ['styled-components', '@darajs/ui-causal-graph-editor'],
            },
        },
    },
}));
