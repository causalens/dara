import { renderHook } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecoilCallback } from 'recoil';

import { setSessionToken } from '@/auth/use-session-token';
import { clearRegistries_TEST, getTabularVariableValue } from '@/shared';
import { WebSocketCtx, useRequestExtras } from '@/shared/context';
import { useTaskContext } from '@/shared/context/global-task-context';

import type { DataFrame, DerivedVariable, ServerVariable, SingleVariable } from '../../js/types';
import { isVariable } from '../../js/types';
import { Wrapper, server } from './utils';
import { mockLocalStorage } from './utils/mock-storage';
import { mockSchema } from './utils/test-server-handlers';

/**
 * Test hook - wraps getTabularVariableValue in a RecoilCallback and provides all the required contexts
 */
function useVariableValue<VV>(
    variable: SingleVariable<VV> | DerivedVariable | ServerVariable
): () => ReturnType<typeof getTabularVariableValue> {
    const taskContext = useTaskContext();
    const { client } = useContext(WebSocketCtx);
    const { search } = useLocation();
    const extras = useRequestExtras();

    if (!isVariable<VV>(variable)) {
        return () => Promise.resolve(variable) as any;
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRecoilCallback(
        ({ snapshot }) => {
            return () => {
                return getTabularVariableValue(variable, {
                    client,
                    search,
                    snapshot,
                    taskContext,
                    extras,
                });
            };
        },
        [variable.uid, taskContext, client, search, extras]
    );
}

const SESSION_TOKEN = 'TEST_TOKEN';

// Mock lodash debounce out so it doesn't cause timing issues in the tests
vi.mock('lodash/debounce', () => vi.fn((fn) => fn));

mockLocalStorage();

describe('getTabularVariableValue', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();

        setSessionToken(SESSION_TOKEN);
    });
    afterEach(() => {
        clearRegistries_TEST();
        setSessionToken(null);
        vi.clearAllTimers();
        server.resetHandlers();
    });
    afterAll(() => server.close());

    it('should resolve a tabular plain variable', async () => {
        const mockData = [
            {
                col1: 1,
                col2: 6,
                col3: 'a',
                col4: 'f',
            },
            {
                col1: 2,
                col2: 7,
                col3: 'b',
                col4: 'g',
            },
        ];

        const variable: SingleVariable<DataFrame> = {
            __typename: 'Variable',
            default: mockData,
            nested: [],
            uid: 'single',
        };

        const { result } = renderHook(() => useVariableValue(variable), {
            wrapper: Wrapper,
        });
        expect(result.current).toBeInstanceOf(Function);

        const resolved = await result.current();
        expect(resolved).toEqual(mockData);
    });

    it('should resolve a plain variable with other json data', async () => {
        const mockData = {
            col1: [1, 2],
            col2: [6, 7],
            col3: ['a', 'b'],
            col4: ['f', 'g'],
        };

        const variable: SingleVariable<Record<string, any>> = {
            __typename: 'Variable',
            default: mockData,
            nested: [],
            uid: 'single-other',
        };

        const { result } = renderHook(() => useVariableValue(variable), {
            wrapper: Wrapper,
        });
        expect(result.current).toBeInstanceOf(Function);

        const resolved = await result.current();
        expect(resolved).toEqual(mockData);
    });

    it('should resolve a server variable', async () => {
        const mockData = [
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
        ];

        server.use(
            http.post('/api/core/tabular-variable/dep2', () => {
                return HttpResponse.json({
                    data: mockData,
                    count: 10,
                    schema: mockSchema,
                });
            })
        );

        const variable: ServerVariable = {
            __typename: 'ServerVariable',
            uid: 'dep2',
            scope: 'global',
        };

        const { result } = renderHook(() => useVariableValue(variable), { wrapper: Wrapper });
        expect(result.current).toBeInstanceOf(Function);

        const resolved = result.current() as Promise<any>;
        expect(typeof resolved === 'object' && typeof resolved.then === 'function').toBe(true);
        const res = await resolved;
        // just the data
        expect(res).toMatchObject([
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
        ]);
    });

    it('should resolve a derived variable', async () => {
        const mockData = [
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
        ];

        server.use(
            http.post('/api/core/derived-variable/dep2', () => {
                return HttpResponse.json({
                    value: {
                        data: mockData,
                        count: 10,
                        schema: mockSchema,
                    },
                    cache_key: 'cache key',
                });
            })
        );

        const variable: DerivedVariable = {
            __typename: 'DerivedVariable',
            uid: 'dep2',
            variables: [],
            nested: [],
            deps: [],
            cache: {
                policy: 'keep-all',
                cache_type: 'global',
            },
        };

        const { result } = renderHook(() => useVariableValue(variable), { wrapper: Wrapper });
        expect(result.current).toBeInstanceOf(Function);

        const resolved = result.current() as Promise<any>;
        expect(typeof resolved === 'object' && typeof resolved.then === 'function').toBe(true);
        const res = await resolved;
        // just the data
        expect(res).toMatchObject([
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
        ]);
    });
});
