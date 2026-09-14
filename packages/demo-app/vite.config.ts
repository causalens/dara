import dara from '@darajs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [dara()],
  server: { watch: { usePolling: process.env['VITE_DEMO_POLLING'] === 'true' } },
});
