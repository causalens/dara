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
        expect(config.server?.host).toBe('localhost');
        expect(config.server?.allowedHosts).toEqual([]);
        expect(config.server?.cors).toBeUndefined();
        expect(config.server?.hmr).toBeUndefined();
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

    it.each([
        ['http://vite.feature.example.test:7777', 'ws', 7777],
        ['https://vite.feature.example.test:7777', 'wss', 7777],
        ['https://vite.feature.example.test', 'wss', 443],
    ])('uses %s for browser assets and HMR while keeping the local port', (origin, protocol, clientPort) => {
        vi.stubEnv('VITE_SERVER_ORIGIN', origin);
        vi.stubEnv('VITE_SERVER_PORT', '3100');
        vi.stubEnv('VITE_SERVER_BIND_HOST', '127.0.0.1');
        vi.stubEnv('VITE_SERVER_ALLOWED_ORIGINS', '["https://ui.feature.example.test"]');
        const config = getConfig();

        expect(config.base).toBe(`${origin}/static/`);
        expect(config.server).toMatchObject({
            origin,
            host: '127.0.0.1',
            port: 3100,
            strictPort: true,
            allowedHosts: ['vite.feature.example.test'],
            cors: { origin: ['https://ui.feature.example.test'] },
            hmr: { host: 'vite.feature.example.test', protocol, clientPort },
        });
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
