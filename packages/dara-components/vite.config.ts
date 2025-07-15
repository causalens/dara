import react from '@vitejs/plugin-react';
import path from 'path';
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
            cssFileName: 'style.css',
        },
        outDir: 'dist/umd',
    },
    worker: {
        format: 'es',
    },
});
