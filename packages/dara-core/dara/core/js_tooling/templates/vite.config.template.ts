import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/static/',
    plugins: [
        react({
            jsxRuntime: 'classic',
        }),
    ],
    publicDir: false,
    build: {
        outDir: '$$output$$',
        assetsDir: '',
        manifest: true,
        rollupOptions: {
            input: './_entry.tsx',
        },
    },
    server: {
        // Root of assets served in DEV mode
        origin: 'http://localhost:3000',
        port: 3000,
        fs: {
            strict: false,
        },
    },
});
