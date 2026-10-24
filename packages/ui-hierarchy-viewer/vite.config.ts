import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Bundle D3's patched implementation; its transitive ranges still allow vulnerable d3-color releases.
export default defineConfig({
    build: {
        emptyOutDir: false,
        target: 'es2015',
        license: { fileName: 'd3-license.md' },
        lib: {
            entry: resolve(import.meta.dirname, 'src/hierarchy-viewer/treemap.tsx'),
            formats: ['es'],
            fileName: () => 'hierarchy-viewer/treemap.js',
        },
        rolldownOptions: {
            external: ['react', 'react/jsx-runtime', '@darajs/styled-components', '@darajs/ui-utils'],
        },
        sourcemap: true,
    },
});
