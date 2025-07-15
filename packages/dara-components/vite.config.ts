import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        react({
            jsxRuntime: 'classic',
        }),
        // Some package we're pulling requires node polyfills for stream
        nodePolyfills({
            include: ['stream'],
        }),
    ],
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    build: {
        minify: false,
        rollupOptions: {
            external: ['react', 'react-dom', 'styled-components', '@darajs/core'],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'styled-components': 'styled',
                    '@darajs/core': 'dara.core',
                },
            },
        },
        lib: {
            entry: path.resolve(__dirname, 'js/index.tsx'),
            name: 'dara.components',
            formats: ['umd'],
            fileName: 'dara.components',
            cssFileName: 'style',
        },
        outDir: 'dist/umd',
    },
    worker: {
        format: 'es',
    },
});
