import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    base: '',
    plugins: [
        react({
            jsxRuntime: 'classic',
        }),
        // Some package we're pulling requires node polyfills for stream
        nodePolyfills({
            globals: {
                process: true,
                Buffer: true,
                global: true,
            },
        }),
    ],
    publicDir: false,
    build: {
        outDir: '$$output$$',
        assetsDir: '',
        manifest: 'manifest.json',
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
    },
});
