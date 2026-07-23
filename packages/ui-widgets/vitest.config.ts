import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        clearMocks: true,
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/vitest-setup.ts'],
    },
});
