import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function daraDevServerPlugin(): Plugin {
    return {
        name: 'dara-dev-server',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/__dara__/dev-server-info', (_request, response) => {
                const info = process.env.VITE_DARA_DEV_SERVER_INFO;

                if (!info) {
                    response.statusCode = 503;
                    response.end();
                    return;
                }

                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({ info }));
            });
        },
    };
}

export default defineConfig(({ command }) => {
    const devServerProtocol = process.env.VITE_SERVER_PROTOCOL ?? 'http';
    const devServerHost = process.env.VITE_SERVER_HOST ?? 'localhost';
    const devServerPort = Number.parseInt(process.env.VITE_SERVER_PORT ?? '3000', 10);
    const devServerOrigin = `${devServerProtocol}://${devServerHost}:${devServerPort}`;

    return {
        // Dev assets must stay under /static/ even though production asset URLs are resolved at runtime.
        base: command === 'serve' ? `${devServerOrigin}/static/` : '',
        plugins: [
            daraDevServerPlugin(),
            react({
                jsxRuntime: 'classic',
            }),
        ],
        publicDir: false,
        build: {
            outDir: '$$output$$',
            assetsDir: '',
            manifest: 'manifest.json',
            rolldownOptions: {
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
            origin: devServerOrigin,
            port: devServerPort,
            strictPort: true,
            fs: {
                strict: false,
            },
        },
        worker: {
            format: 'es',
        },
    };
});
