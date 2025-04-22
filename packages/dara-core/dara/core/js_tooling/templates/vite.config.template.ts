import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    base: '',
    plugins: [
        react({
            jsxRuntime: 'classic',
        })
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
    experimental: {
        renderBuiltUrl(filename, { hostType }) {
            if (hostType !== 'css') {
                return { runtime: `window.__toDaraUrl(${JSON.stringify(filename)})` };
            }
            return { relative: true };
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
    worker: {
        format: 'es',
    }
});
