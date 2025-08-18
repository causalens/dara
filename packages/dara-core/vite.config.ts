import react from '@vitejs/plugin-react';
import path from 'path';
import { URL, fileURLToPath } from 'url';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        react({
            jsxRuntime: 'classic',
        }),
    ],
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    build: {
        minify: false,
        rollupOptions: {
            external: ['react', 'react-dom', 'styled-components', '@tanstack/react-query'],
            output: {
                exports: 'named',
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'styled-components': 'styled',
                    '@tanstack/react-query': 'ReactQuery',
                },
            },
        },
        lib: {
            entry: path.resolve(__dirname, 'js/index.tsx'),
            name: 'dara.core',
            formats: ['umd'],
            fileName: 'dara.core',
            cssFileName: 'style',
        },
        outDir: 'dist/umd',
        emptyOutDir: false,
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
});
