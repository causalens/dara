/* eslint-disable react-hooks/rules-of-hooks */

/* eslint-disable react-hooks/exhaustive-deps */
import { useContext, useEffect, useMemo, useState } from 'react';
import { Snapshot, useRecoilValue, useRecoilValueLoadable } from 'recoil';

import type { RequestExtras } from '@/api/http';
import type { WebSocketClientInterface } from '@/api/websocket';
// eslint-disable-next-line import/no-cycle
import { VariableCtx, WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import {
    type DataFrame,
    type DerivedVariable,
    type GlobalTaskContext,
    type ServerVariable,
    type SingleVariable,
    isServerVariable,
    isSingleVariable,
    isVariable,
} from '@/types';

import { createFetcher } from './filtering';
import { type DerivedResult, getOrRegisterDerivedVariableResult, resolveVariable, useVariable } from './internal';
import { getOrRegisterServerVariable } from './server-variable';
import { type DataFetcher, useFetchTabularDerivedVariable, useFetchTabularServerVariable } from './tabular-variable';
import { type GetVariableValueCtx, getVariableValue } from './use-variable-value';

/**
 * Helper hook which turns any variable into a callback to return DataFrame.
 * Can be used in components that only work with tabular data.
 *
 * Optionally pass in filters, pagination, and other options to fetch data.
 *
 * The callback identity changes whenever a refetch should be triggered.
 *
 * @param variable data variable
 */
export function useTabularVariable(
    variable: SingleVariable | DerivedVariable | ServerVariable | DataFrame
): DataFetcher {
    const extras = useRequestExtras();
    const { client: wsClient } = useContext(WebSocketCtx);

    if (!isVariable(variable) || isSingleVariable(variable)) {
        const [data] = useVariable(variable);
        return useMemo(() => createFetcher(data), [data]);
    }

    // Synchronously register subscription to the underlying DV, clean up on unmount
    const variablesContext = useContext(VariableCtx);
    variablesContext?.variables.current.add(variable.uid);
    useEffect(() => {
        return () => {
            variablesContext?.variables.current.delete(variable.uid);
        };
    }, []);

    if (isServerVariable(variable)) {
        const serverAtom = getOrRegisterServerVariable(variable, extras);
        const atomCount = useRecoilValue(serverAtom);

        return useFetchTabularServerVariable(variable, atomCount, wsClient, extras);
    }

    const taskContext = useTaskContext();

    const dvResultSelector = getOrRegisterDerivedVariableResult(variable, wsClient, taskContext, extras);
    const dvResultLoadable = useRecoilValueLoadable(dvResultSelector);
    const [dvResult, setDvResult] = useState<DerivedResult>(() => dvResultLoadable.getValue());
    useEffect(() => {
        // Whenever loadable changes value, update the result
        // The result selector is synchronous so we don't have to worry about suspending
        if (dvResultLoadable.state === 'hasValue') {
            setDvResult(dvResultLoadable.getValue());
        }
    }, [dvResultLoadable]);

    return useFetchTabularDerivedVariable(variable, dvResult, wsClient, taskContext, extras);
}

/**
 * Return the entire tabular variable as a DataFrame
 * */
export async function getTabularVariableValue(
    variable: DataFrame | SingleVariable | DerivedVariable | ServerVariable,
    ctx: {
        client: WebSocketClientInterface;
        extras: RequestExtras;
        search: string;
        snapshot: Snapshot;
        taskContext: GlobalTaskContext;
    }
): Promise<DataFrame> {
    if (!isVariable(variable)) {
        return variable;
    }

    if (isSingleVariable(variable)) {
        // in this case it's safe to getValue directly from the Recoil state
        return resolveVariable(variable, ctx.client, ctx.taskContext, ctx.extras, (v) =>
            ctx.snapshot.getLoadable(v).getValue()
        );
    }

    if (isServerVariable(variable)) {
        const result = fetchTabularServerVariable({
            variable,
            seqNumber: resolved.sequence_number,
            wsClient: ctx.client,
            extras: ctx.extras,
        }).then((resp) => {
            return resp.data;
        });
        return result;
    }

    // derived variable
    return fetchDerivedVariable({
        cache: variable.cache,
        extras: ctx.extras,
        force_key: null,
        /**
         * In this case we're not concerned about different selectors fetching the value so just use the uid
         */
        selectorKey: resolved.uid,

        values: normalizeRequest(cleanArgs(resolved.values), (variable as DerivedVariable).variables),
        variableUid: resolved.uid,
        wsClient: ctx.client,
    }).then((resp) => {
        // This is really only used in DownloadVariable currently; we can add support for tasks
        // if it is requested in the future
        if (isTaskResponse(resp)) {
            throw new Error('Task DerivedVariables are not supported in this context');
        }

        return resp.value;
    }) as Promise<VV>;
}
