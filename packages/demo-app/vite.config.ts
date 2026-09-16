import dara from '@darajs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [dara()],
  server: { watch: { usePolling: process.env['VITE_DEMO_POLLING'] === 'true' } },
  // Workspace packages are symlinked, so Vite skips pre-bundling them and serves every
  // module individually. The icon barrel alone is ~2000 files. Nobody edits icons while
  // working on an app, so trading its HMR for one request is worth it in this repo.
  optimizeDeps: { include: ['@darajs/ui-icons'] },
});
