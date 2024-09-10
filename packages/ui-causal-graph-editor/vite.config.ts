import { fileURLToPath, URL } from 'url';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.tsx'),
            name: 'UiCausalGraphEditor',
            fileName: 'index',
        },
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
    },
    resolve: {
        alias: [
            { find: '@types', replacement: fileURLToPath(new URL('./src/types.tsx', import.meta.url)) },
            { find: '@shared/', replacement: fileURLToPath(new URL('./src/shared/', import.meta.url)) },
        ],
    },
    worker: {
        format: 'es'
    }
});
