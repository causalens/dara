import { fireEvent, render, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { useState } from 'react';

import { request } from '@/api';
import { setSessionToken } from '@/auth/use-session-token';
import { PartialRequestExtrasProvider, RequestExtrasProvider, useRequestExtras } from '@/shared';

/**
 * Testbed component that makes a request and displays the result.
 *
 * This is simply testing `useRequestExtras` -> `extras` under the assumption
 * that all network requests are made using the `request` function and pass through `useRequestExtras`.
 */
function TestComponent(): JSX.Element {
    const extras = useRequestExtras();
    const [result, setResult] = useState(null);

    async function makeRequest(): Promise<void> {
        const res = await request('/foo', { method: 'GET' }, extras);
        setResult(await res.json());
    }

    return (
        <div>
            <button data-testid="request" onClick={makeRequest} type="button">
                Make Request
            </button>
            <div data-testid="response">{JSON.stringify(result)}</div>
        </div>
    );
}

const server = setupServer(
    rest.get('/foo', (req, res, ctx) => {
        return res(ctx.json(Object.fromEntries(req.headers.entries())));
    })
);

describe('Request Extras', () => {
    beforeEach(() => {
        server.listen();
        setSessionToken('TEST_TOKEN');
    });

    afterEach(() => {
        server.resetHandlers();
        setSessionToken(null);
    });
    afterAll(() => server.close());

    it('should send session token', async () => {
        const { getByTestId } = render(<TestComponent />);

        fireEvent.click(getByTestId('request'));

        await waitFor(() => {
            const parsedHeaders = JSON.parse(getByTestId('response').textContent);
            expect(parsedHeaders.accept).toEqual('application/json');
            expect(parsedHeaders.authorization).toEqual('Bearer TEST_TOKEN');
        });
    });

    it('should include request extras from context', async () => {
        const { getByTestId } = render(
            <RequestExtrasProvider
                options={{
                    headers: {
                        'X-Dara-Test': 'test-value',
                    },
                }}
            >
                <TestComponent />
            </RequestExtrasProvider>
        );

        fireEvent.click(getByTestId('request'));

        await waitFor(() => {
            const parsedHeaders = JSON.parse(getByTestId('response').textContent);
            expect(parsedHeaders.accept).toEqual('application/json');
            expect(parsedHeaders.authorization).toEqual('Bearer TEST_TOKEN');
            expect(parsedHeaders['x-dara-test']).toEqual('test-value');
        });
    });

    it('should override request extras with nested context', async () => {
        const { getByTestId } = render(
            <RequestExtrasProvider
                options={{
                    headers: {
                        'X-Dara-Test': 'test-value',
                    },
                }}
            >
                <RequestExtrasProvider
                    options={{
                        headers: {
                            'X-Dara-Test-2': 'test-value-2',
                        },
                    }}
                >
                    <TestComponent />
                </RequestExtrasProvider>
            </RequestExtrasProvider>
        );

        fireEvent.click(getByTestId('request'));

        await waitFor(() => {
            const parsedHeaders = JSON.parse(getByTestId('response').textContent);
            expect(parsedHeaders.accept).toEqual('application/json');
            expect(parsedHeaders.authorization).toEqual('Bearer TEST_TOKEN');
            expect(parsedHeaders['x-dara-test-2']).toEqual('test-value-2');
            expect(parsedHeaders['x-dara-test']).toBeUndefined();
        });
    });

    it('should merge request extras with nested context when using Partial Provider', async () => {
        const { getByTestId } = render(
            <RequestExtrasProvider
                options={{
                    headers: {
                        'X-Dara-Test': 'test-value',
                    },
                }}
            >
                <PartialRequestExtrasProvider
                    options={{
                        headers: {
                            'X-Dara-Test-2': 'test-value-2',
                        },
                    }}
                >
                    <TestComponent />
                </PartialRequestExtrasProvider>
            </RequestExtrasProvider>
        );

        fireEvent.click(getByTestId('request'));

        await waitFor(() => {
            const parsedHeaders = JSON.parse(getByTestId('response').textContent);
            expect(parsedHeaders.accept).toEqual('application/json');
            expect(parsedHeaders.authorization).toEqual('Bearer TEST_TOKEN');
            expect(parsedHeaders['x-dara-test-2']).toEqual('test-value-2');
            expect(parsedHeaders['x-dara-test']).toEqual('test-value');
        });
    });
});
