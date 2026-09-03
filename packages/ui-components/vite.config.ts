import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Create two separate configs - one for the library and one for the trace viewer
export default defineConfig({
    plugins: [
        react({
            jsxRuntime: 'automatic',
        }),
    ],
    test: {
        clearMocks: true,
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/vitest-setup.ts'],
    },
});
