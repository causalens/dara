import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ResponseResolverInfo } from 'msw/lib/core/handlers/RequestHandler';

import type { ServerVariableMessage } from '@/api/websocket';
import {
    type DerivedVariable,
    type FilterQuery,
    type Pagination,
    type ServerVariable,
    type SingleVariable,
} from '@/types/core';

import { type DataResponse, useTabularVariable } from '../../js/shared';
import { MockWebSocketClient, Wrapper, server } from './utils';
import { mockLocalStorage } from './utils/mock-storage';
import { mockSchema } from './utils/test-server-handlers';

const createMockDataResponse = async (info: ResponseResolverInfo<any>): Promise<DataResponse> => {
    const body = await info.request.json();
    const { searchParams } = new URL(info.request.url);
    return {
        count: 10,
        data: [
            {
                col1: 1,
                col2: 6,
                col3: 'a',
                col4: 'f',
            },
            {
                col1: 2,
                col2: 5,
                col3: 'b',
                col4: 'e',
            },
            {
                // fields required for derived variables - so we can check they are sent
                force_key: body.force_key,
                dv_values: body.dv_values,

                // Append what filters were sent
                filters: body.filters,

                limit: searchParams.get('limit'),

                offset: searchParams.get('offset'),
                order_by: searchParams.get('order_by'),

                // time of response to check for re-fetches
                time: Date.now(),
                ws_channel: body.ws_channel,
            },
        ],
        schema: mockSchema,
    };
};

// Handler specifically for tabular Derived Variable tests
const tabularDvHandler = http.post('/api/core/tabular-variable/:uid', async (info) => {
    const body = (await info.request.json()) as any;
    const { searchParams } = new URL(info.request.url);
    return HttpResponse.json({
        schema: mockSchema,
        count: 10,
        data: [
            {
                col1: 1,
                col2: 6,
                col3: 'a',
                col4: 'f',
            },
            {
                col1: 2,
                col2: 5,
                col3: 'b',
                col4: 'e',
            },
            {
                // fields required for derived variables - so we can check they are sent
                force_key: body.force_key,
                dv_values: body.dv_values,

                // Append what filters were sent
                filters: body.filters,

                limit: searchParams.get('limit'),
                offset: searchParams.get('offset'),
                order_by: searchParams.get('order_by'),

                // time of response to check for re-fetches
                time: Date.now(),
                ws_channel: body.ws_channel,
            },
        ],
    });
});

// Mock lodash debounce out so it doesn't cause timing issues in the tests
vi.mock('lodash/debounce', () => vi.fn((fn) => fn));

mockLocalStorage();

describe('useTabularVariable', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
    });
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    describe('Server Variable', () => {
        beforeEach(() => {
            // required for the server variable to resolve
            server.use(
                http.get('/api/core/server-variable/dep2/sequence', (info) => {
                    return HttpResponse.json({ sequence_number: 1 });
                })
            );
            // returns actual data
            server.use(
                http.post('/api/core/tabular-variable/dep2', async (info) => {
                    return HttpResponse.json(await createMockDataResponse(info));
                })
            );
        });

        it('returns a callback which requests data', async () => {
            const dataVariable: ServerVariable = {
                __typename: 'ServerVariable',
                uid: 'dep2',
                scope: 'global',
            };

            const { result } = renderHook(() => useTabularVariable(dataVariable), {
                wrapper: Wrapper,
            });
            await waitFor(() => expect(result.current).toBeInstanceOf(Function));

            const mockFilters = {
                value: 1,
                column: 'col1',
                operator: 'EQ',
            } satisfies FilterQuery;

            const mockPagination = {
                limit: 10,
                offset: 1,
                sort: {
                    desc: false,
                    id: 'col1',
                },
            } satisfies Pagination;

            const dataResponse = await result.current(mockFilters, mockPagination);
            expect(dataResponse.data).toBeInstanceOf(Array);
            // check filters/pagination were passed to the endpoint correctly (they are returned from the mock endpoint as-is)
            expect(dataResponse.data![2]!.filters).toEqual(mockFilters);
            expect(dataResponse.data![2]!.limit).toEqual(String(mockPagination.limit));
            expect(dataResponse.data![2]!.offset).toEqual(String(mockPagination.offset));
            expect(dataResponse.data![2]!.order_by).toEqual(mockPagination.sort.id);

            expect(dataResponse.count).toEqual(10); // the mock endpoint always returns 10
            expect(dataResponse.schema).toEqual(mockSchema);
        });

        it('callback updates when server variable sequence number changes', async () => {
            const dataVariable: ServerVariable = {
                __typename: 'ServerVariable',
                uid: 'dep2',
                scope: 'global',
            };

            const client = new MockWebSocketClient('uid');
            const { result } = renderHook(() => useTabularVariable(dataVariable), {
                wrapper: (props) => <Wrapper {...props} client={client} />,
            });
            await waitFor(() => expect(result.current).toBeInstanceOf(Function));
            const before = result.current;
            act(() => {
                client.receiveMessage({
                    message: {
                        uid: 'dep2',
                        sequence_number: 2,
                        __type: 'ServerVariable',
                    },
                    type: 'message',
                } satisfies ServerVariableMessage);
            });
            // hook identity changes - so it can be used to detect when to refetch
            expect(result.current === before).toBeFalsy();
        });
    });

    describe('Tabular Derived Variable', () => {
        it('returns a callback which requests data', async () => {
            server.use(tabularDvHandler);

            const variableA: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'a',
            };
            const dataVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                cache: {
                    policy: 'keep-all',
                    cache_type: 'global',
                },
                deps: [variableA],
                uid: 'dep2',
                variables: [variableA],
                nested: [],
            };

            const { result } = renderHook(() => useTabularVariable(dataVariable), {
                wrapper: Wrapper,
            });
            await waitFor(() => expect(result.current).toBeInstanceOf(Function));

            const dataResponse = await result.current(null, null);

            expect(dataResponse.count).toEqual(10); // the mock endpoint always returns 10
            expect(dataResponse.schema).toEqual(mockSchema);
        });

        it('callback returns value correctly if task is returned', async () => {
            // keep original request around so we can use it in the task result
            let originalRequest: ResponseResolverInfo<any>;

            // Force the tabular endpoint to signify that a task has started
            server.use(
                http.post('/api/core/tabular-variable/:uid', async (info) => {
                    originalRequest = info;
                    const { uid } = info.params;
                    return HttpResponse.json({
                        task_id: `t_${String(uid)}_MetaTask`,
                    });
                })
            );

            // Mock task result - same as usual tabular response
            server.use(
                http.get('/api/core/tasks/:taskId', async (info) => {
                    return HttpResponse.json(await createMockDataResponse(originalRequest));
                })
            );

            const variableA: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'a',
            };
            const dataVariable: DerivedVariable = {
                __typename: 'DerivedVariable',
                cache: {
                    policy: 'keep-all',
                    cache_type: 'global',
                },
                deps: [variableA],
                uid: 'dep2',
                variables: [variableA],
                nested: [],
            };

            const client = new MockWebSocketClient('uid');
            const { result } = renderHook(() => useTabularVariable(dataVariable), {
                wrapper: (props) => <Wrapper {...props} client={client} />,
            });
            expect(result.current).toBeInstanceOf(Function);
            let dataResponse: DataResponse | null = null;
            await act(async () => {
                const dataResponsePromise = result.current(null, null);
                client.receiveMessage({
                    message: {
                        uid: 'dep2',
                        __type: 'ServerVariable',
                        sequence_number: 2,
                    },
                    type: 'message',
                } satisfies ServerVariableMessage);
                dataResponse = await dataResponsePromise;
            });
            expect(dataResponse!.count).toEqual(10); // the mock endpoint always returns 10
            expect(dataResponse!.schema).toEqual(mockSchema);
        });
    });
});
