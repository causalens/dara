import { defineConfig } from 'cypress';

export default defineConfig({
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 20000,
    e2e: {
        baseUrl: 'http://localhost:8000',
        specPattern: 'cypress/integration/**/*.ts',
        supportFile: 'cypress/support/index.ts',
    },
});
