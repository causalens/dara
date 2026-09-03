import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { URL, fileURLToPath } from 'url';
import { esmExternalRequirePlugin } from 'vite';
import { defineConfig } from 'vitest/config';

const externalDependencies = ['react', 'react-dom', 'styled-components', '@tanstack/react-query'];

export default defineConfig(({ mode }) => ({
    plugins: [
        esmExternalRequirePlugin({
            external: externalDependencies,
        }),
        react(),
    ],
    define: {
        'process.env.NODE_ENV': mode === 'test' ? '"test"' : '"production"',
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.tsx'),
            name: 'UiCausalGraphEditor',
            fileName: 'index',
        },
        rolldownOptions: {
            output: {
                exports: 'named',
                strict: true,
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'styled-components': 'styled',
                    '@tanstack/react-query': 'ReactQuery',
                },
            },
        },
    },
    resolve: {
        alias: [
            { find: '@types', replacement: fileURLToPath(new URL('./src/types.tsx', import.meta.url)) },
            { find: '@shared/', replacement: fileURLToPath(new URL('./src/shared/', import.meta.url)) },
        ],
    },
    worker: {
        format: 'es',
    },
    test: {
        clearMocks: true,
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/vitest-setup.ts'],
    },
}));
