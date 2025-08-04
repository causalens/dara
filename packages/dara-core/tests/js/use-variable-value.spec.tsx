import { renderHook } from '@testing-library/react';
import { rest } from 'msw';
import { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecoilCallback } from 'recoil';

import { WebSocketCtx, useRequestExtras } from '@/shared/context';
import { useTaskContext } from '@/shared/context/global-task-context';

import { getVariableValue } from '../../js/shared/interactivity';
import type { DerivedVariable, ServerVariable, SingleVariable, Variable } from '../../js/types';
import { isVariable } from '../../js/types';
import { Wrapper, server } from './utils';
import { mockSchema } from './utils/test-server-handlers';

/**
 * Test hook - wraps getVariableValue in a RecoilCallback and provides all the required contexts
 */
function useVariableValue<VV, B extends boolean = false>(
    variable: VV | Variable<VV> | DerivedVariable,
    shouldFetchVariable: B = false as B
): () => ReturnType<typeof getVariableValue<VV, B>> {
    const taskContext = useTaskContext();
    const { client } = useContext(WebSocketCtx);
    const { search } = useLocation();
    const extras = useRequestExtras();

    if (!isVariable<VV>(variable)) {
        return () => variable;
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRecoilCallback(
        ({ snapshot }) => {
            return () => {
                return getVariableValue<VV, B>(variable, shouldFetchVariable, {
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

describe('getVariableValue', () => {
    beforeEach(() => server.listen());
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    it('should return a callback that creates the correct structure', () => {
        const variable: SingleVariable<number> = {
            __typename: 'Variable',
            default: 5,
            nested: [],
            uid: 'single',
        };

        const nestedDerivedVariable: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variable],
            nested: [],
            uid: 'nested-derived',
            variables: [variable],
        };

        const variableNotInDeps: SingleVariable<number> = {
            __typename: 'Variable',
            default: 1,
            nested: [],
            uid: 'single-number',
        };

        const derivedVariable: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [nestedDerivedVariable, variableNotInDeps],
            nested: [],
            uid: 'derived',
            variables: [nestedDerivedVariable, variableNotInDeps],
        };

        const { result } = renderHook(() => useVariableValue(derivedVariable), { wrapper: Wrapper });

        expect(result.current).toBeInstanceOf(Function);

        const resolved = result.current();
        expect(resolved).toEqual({
            deps: [0, 1],
            type: 'derived',
            uid: derivedVariable.uid,
            values: [
                {
                    deps: [0],
                    type: 'derived',
                    uid: nestedDerivedVariable.uid,
                    values: [variable.default],
                },
                variableNotInDeps.default,
            ],
        });
    });

    it('should return a promise for the derived variable if shouldFetchVariable is set to true', async () => {
        const variable: SingleVariable<number> = {
            __typename: 'Variable',
            default: 5,
            nested: [],
            uid: 'single',
        };

        const nestedDerivedVariable: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variable],
            nested: [],
            uid: 'nested-derived',
            variables: [variable],
        };

        const variableNotInDeps: SingleVariable<number> = {
            __typename: 'Variable',
            default: 1,
            nested: [],
            uid: 'single-number',
        };

        const derivedVariable: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [nestedDerivedVariable, variableNotInDeps],
            nested: [],
            uid: 'derived',
            variables: [nestedDerivedVariable, variableNotInDeps],
        };

        const { result } = renderHook(() => useVariableValue(derivedVariable, true), { wrapper: Wrapper });

        expect(result.current).toBeInstanceOf(Function);

        const resolved = result.current() as Promise<any>;
        expect(typeof resolved === 'object' && typeof resolved.then === 'function').toBe(true);
        const res = await resolved;
        expect(res).toEqual({
            force_key: null,
            values: {
                data: [
                    {
                        force_key: null,
                        type: 'derived',
                        uid: 'nested-derived',
                        values: [
                            {
                                __ref: 'Variable:single',
                            },
                        ],
                    },
                    {
                        __ref: 'Variable:single-number',
                    },
                ],
                lookup: {
                    'Variable:single': 5,
                    'Variable:single-number': 1,
                },
            },
            ws_channel: 'uid',
        });
    });

    it.only('should return a promise for server variable if shouldFetchVariable is set to true', async () => {
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
            rest.post('/api/core/tabular-variable/dep2', async (req, res, ctx) => {
                return res(
                    ctx.json({
                        data: mockData,
                        count: 10,
                        schema: mockSchema,
                    })
                );
            })
        );

        const variable: ServerVariable = {
            __typename: 'ServerVariable',
            uid: 'dep2',
            scope: 'global',
        };

        const { result } = renderHook(() => useVariableValue(variable, true), { wrapper: Wrapper });

        expect(result.current).toBeInstanceOf(Function);

        const resolved = result.current() as Promise<any>;
        expect(typeof resolved === 'object' && typeof resolved.then === 'function').toBe(true);
        const res = await resolved;
        expect(res).toMatchObject({
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
            ],
            count: 10,
            schema: mockSchema,
        });
    });
});
