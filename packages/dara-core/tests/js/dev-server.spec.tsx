import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from 'vite';

import viteConfig from '../../dara/core/js_tooling/templates/vite.config.template';

describe('Dara Vite development server', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    const configEnvironment: ConfigEnv = {
        command: 'serve',
        isPreview: false,
        isSsrBuild: false,
        mode: 'development',
    };

    function getConfig(command: ConfigEnv['command'] = 'serve'): UserConfig {
        if (typeof viteConfig !== 'function') {
            throw new Error('Dara Vite config should depend on the current Vite command');
        }

        return viteConfig({
            ...configEnvironment,
            command,
        }) as UserConfig;
    }

    it('uses a strict default port', () => {
        const config = getConfig();

        expect(config.base).toBe('http://localhost:3000/static/');
        expect(config.server?.origin).toBe('http://localhost:3000');
        expect(config.server?.port).toBe(3000);
        expect(config.server?.strictPort).toBe(true);
    });

    it('does not use the development server origin for production builds', () => {
        expect(getConfig('build').base).toBe('');
    });

    it('uses the configured development server port', () => {
        vi.stubEnv('VITE_SERVER_PORT', '3100');

        const config = getConfig();

        expect(config.base).toBe('http://localhost:3100/static/');
        expect(config.server?.origin).toBe('http://localhost:3100');
        expect(config.server?.port).toBe(3100);
    });

    it('serves the Dara project identity', async () => {
        vi.stubEnv('VITE_DARA_DEV_SERVER_INFO', 'encoded-project-info');

        const config = getConfig();
        const plugin = config.plugins?.[0] as Plugin;
        const use = vi.fn();

        if (typeof plugin.configureServer !== 'function') {
            throw new Error('Dara development server plugin is missing configureServer');
        }

        const configureServer = plugin.configureServer as (server: ViteDevServer) => void | Promise<void>;
        await configureServer({
            middlewares: {
                use,
            },
        } as unknown as ViteDevServer);

        const handler = use.mock.calls.find(([path]) => path === '/__dara__/dev-server-info')?.[1];
        const response = {
            end: vi.fn(),
            setHeader: vi.fn(),
            statusCode: 200,
        };

        handler({}, response);

        expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        expect(response.end).toHaveBeenCalledWith(JSON.stringify({ info: 'encoded-project-info' }));
    });
});
