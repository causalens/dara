/**
 * Build script configuration.
 * This outputs a single minified bundle meant to be ran directly using Node.js 14+.
 *
 * Note: this does not do Typescript typechecking, which is why the npm build script
 * runs `tsc` first directly
 *
 * See: https://esbuild.github.io/api/#build-api
 */
require('esbuild')
    .build({
        banner: {
            js: '#!/usr/bin/env node',
        },
        bundle: true,
        entryPoints: ['./src/index.ts'],
        format: 'cjs',
        logLevel: 'info',
        minify: true,
        platform: 'node',
        outfile: 'main.js',
        target: 'node14',
    })
    .catch(() => process.exit(1));
