import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Create two separate configs - one for the library and one for the trace viewer
export default defineConfig({
    plugins: [
        react({
            jsxRuntime: 'automatic',
        }),
    ],
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext',
            supported: {
                bigint: true
            },
        },
    },
});
