import { waitFor } from '@testing-library/dom';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { WebSocketClient } from '@/api';
import { deferred } from '@/shared';

const authServer = setupServer();

class FailingWebSocket extends EventTarget {
    static CONNECTING = 0;

    static OPEN = 1;

    static CLOSING = 2;

    static CLOSED = 3;

    url: string;

    lastSentData: string | null = null;

    readyState = FailingWebSocket.CONNECTING;

    constructor(url: string | URL) {
        super();
        this.url = url.toString();

        setTimeout(() => {
            this.readyState = FailingWebSocket.CLOSED;
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new Event('close'));
        }, 0);
    }

    send(data: string): void {
        this.lastSentData = data;
    }

    close(): void {
        this.readyState = FailingWebSocket.CLOSED;
    }
}

describe('Websocket auth recovery', () => {
    const originalLocation = window.location;
    const originalWebSocket = globalThis.WebSocket;

    beforeAll(() => {
        authServer.listen();
    });

    afterEach(() => {
        authServer.resetHandlers();
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: originalLocation,
        });
        Object.defineProperty(globalThis, 'WebSocket', {
            configurable: true,
            writable: true,
            value: originalWebSocket,
        });
    });

    afterAll(() => {
        authServer.close();
    });

    it('redirects to login when websocket reconnect auth fails with an invalid token', async () => {
        authServer.use(
            http.post('/api/auth/verify-session', () => {
                return HttpResponse.json(
                    {
                        detail: {
                            message: 'Token is invalid, please log in again',
                            reason: 'invalid_token',
                        },
                    },
                    { status: 401 }
                );
            }),
            http.post('/api/auth/refresh-token', () => {
                return HttpResponse.json(
                    {
                        detail: {
                            message: 'No refresh token provided',
                            reason: 'bad_request',
                        },
                    },
                    { status: 400 }
                );
            })
        );

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            Object.defineProperty(window, 'location', {
                configurable: true,
                enumerable: true,
                value: new URL('http://localhost:8001/app?foo=bar'),
            });
            Object.defineProperty(globalThis, 'WebSocket', {
                configurable: true,
                writable: true,
                value: FailingWebSocket,
            });
            window.dara = {
                base_url: 'http://localhost:8001',
                ws: deferred<WebSocketClient>(),
            };

            const client = new WebSocketClient('ws://localhost:1234');
            client.maxAttempts = 0;

            await waitFor(() => {
                expect(window.location.pathname).toBe('/login');
            });
            expect(window.location.search).toContain('referrer=%2Fapp%3Ffoo%3Dbar');

            client.close();
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });
});
