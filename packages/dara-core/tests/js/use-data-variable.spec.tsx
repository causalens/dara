import { act, renderHook } from '@testing-library/react';
import { rest } from 'msw';

import { combineFilters, useDataVariable } from '../../js/shared';
import { DataVariable, DerivedDataVariable, FilterQuery, Pagination, SingleVariable } from '../../js/types';
import { MockWebSocketClient, Wrapper, server } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

// Mock lodash debounce out so it doesn't cause timing issues in the tests
jest.mock('lodash/debounce', () => jest.fn((fn) => fn));

mockLocalStorage();

describe('useDataVariable', () => {
    beforeEach(() => {
        server.listen();
        window.localStorage.clear();
        jest.restoreAllMocks();
    });
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    describe('Data Variable', () => {
        it('returns a callback which requests data', async () => {
            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const { result } = renderHook(() => useDataVariable(dataVariable), { wrapper: Wrapper });
            expect(result.current).toBeInstanceOf(Function);
            const dataResponse = await result.current();
            expect(dataResponse.data).toBeInstanceOf(Array);
            // check filters were passed to the endpoint correctly (they are returned from the mock endpoint as-is)
            expect(dataResponse.data[2].filters).toEqual(dataVariable.filters);
            expect(dataResponse.totalCount).toEqual(10); // the mock endpoint always returns 10
        });

        it('merges filters and pagination with variable filters', async () => {
            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const { result } = renderHook(() => useDataVariable(dataVariable), { wrapper: Wrapper });

            const extraFilters: FilterQuery = {
                column: 'col3',
                operator: 'CONTAINS',
                value: 'test',
            };
            const pagination: Pagination = {
                limit: 10,
                offset: 5,
                sort: {
                    desc: false,
                    id: 'col1',
                },
            };
            const dataResponse = await result.current(extraFilters, pagination);
            const responseMeta = dataResponse.data[2];
            expect(responseMeta.filters).toEqual(combineFilters('AND', [dataVariable.filters, extraFilters]));
            expect(responseMeta.limit).toEqual('10');
            expect(responseMeta.offset).toEqual('5');
            expect(responseMeta.order_by).toEqual('col1');
        });

        it('callback updates when server trigger is received', () => {
            const dataVariable: DataVariable = {
                __typename: 'DataVariable',
                cache: 'global',
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
            };

            const client = new MockWebSocketClient('uid');
            const { result } = renderHook(() => useDataVariable(dataVariable), {
                wrapper: (props) => <Wrapper {...props} client={client} />,
            });
            expect(result.current).toBeInstanceOf(Function);
            const before = result.current;
            act(() => {
                client.receiveMessage({
                    message: {
                        data_id: 'dep2',
                    },
                    type: 'message',
                });
            });
            // hook identity changes - so it can be used to detect when to refetch
            expect(result.current === before).toBeFalsy();
        });
    });
    describe('Derived Data Variable', () => {
        it('returns a callback which requests data', async () => {
            const variableA: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'a',
            };
            const dataVariable: DerivedDataVariable = {
                __typename: 'DerivedDataVariable',
                cache: 'global',
                deps: [variableA],
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
                variables: [variableA],
            };

            const { result } = renderHook(() => useDataVariable(dataVariable), { wrapper: Wrapper });
            expect(result.current).toBeInstanceOf(Function);
            let dataResponse;
            await act(async () => {
                dataResponse = await result.current();
            });
            expect(dataResponse.totalCount).toEqual(10); // the mock endpoint always returns 10
            expect(dataResponse.data[2].cache_key).toEqual(
                '{"data":[{"__ref":"Variable:a"}],"lookup":{"Variable:a":1}}'
            ); // cache key is the cache key returned by the derived variable endpoint
        });

        it('callback returns value correctly if task is returned', async () => {
            // Force the DV endpoint to signify that a task has started
            server.use(
                rest.post('/api/core/derived-variable/:uid', async (req, res, ctx) => {
                    const { uid } = req.params;
                    return res(
                        ctx.json({
                            cache_key: JSON.stringify(req.body.values),
                            task_id: `t_${String(uid)}_MetaTask`,
                        })
                    );
                })
            );

            // Mock task result
            server.use(
                rest.get('/api/core/tasks/:taskId', async (req, res, ctx) => {
                    return res(
                        ctx.json([
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
                                cache_key: req.body.cache_key,
                            },
                        ])
                    );
                })
            );

            const variableA: SingleVariable<number> = {
                __typename: 'Variable',
                default: 1,
                nested: [],
                uid: 'a',
            };
            const dataVariable: DerivedDataVariable = {
                __typename: 'DerivedDataVariable',
                cache: 'global',
                deps: [variableA],
                filters: {
                    clauses: [
                        {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        {
                            column: 'col2',
                            operator: 'EQ',
                            value: 'val2',
                        },
                    ],
                    combinator: 'AND',
                },
                uid: 'dep2',
                variables: [variableA],
            };

            const client = new MockWebSocketClient('uid');
            const { result } = renderHook(() => useDataVariable(dataVariable), {
                wrapper: (props) => <Wrapper {...props} client={client} />,
            });
            expect(result.current).toBeInstanceOf(Function);
            let dataResponse;
            await act(async () => {
                const dataResponsePromise = result.current();
                client.receiveMessage({
                    message: {
                        data_id: 'dep2',
                    },
                    type: 'message',
                });
                dataResponse = await dataResponsePromise;
            });
            expect(dataResponse.data[2].cache_key).toEqual(
                '{"data":[{"__ref":"Variable:a"}],"lookup":{"Variable:a":1}}'
            );
            expect(dataResponse.totalCount).toEqual(10); // the mock endpoint always returns 10
        });
    });
});
