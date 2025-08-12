/* eslint-disable react-hooks/rules-of-hooks */

/* eslint-disable react-hooks/exhaustive-deps */
import { useContext, useEffect, useMemo, useState } from 'react';
import { type Snapshot, useRecoilValue, useRecoilValueLoadable } from 'recoil';

import type { RequestExtras } from '@/api/http';
import type { WebSocketClientInterface } from '@/api/websocket';
// eslint-disable-next-line import/no-cycle
import { VariableCtx, WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import {
    type DataFrame,
    type DerivedVariable,
    type GlobalTaskContext,
    type ResolvedDerivedVariable,
    type ServerVariable,
    type SingleVariable,
    UserError,
    isServerVariable,
    isSingleVariable,
    isVariable,
} from '@/types';

import { normalizeRequest } from '../utils/normalization';
import { createFetcher } from './filtering';
// eslint-disable-next-line import/no-cycle
import {
    type DerivedResult,
    cleanArgs,
    fetchDerivedVariable,
    getOrRegisterDerivedVariableResult,
    isTaskResponse,
    resolveVariable,
    useVariable,
} from './internal';
import { getOrRegisterServerVariable } from './server-variable';
import {
    type DataFetcher,
    type DataResponse,
    fetchTabularServerVariable,
    useFetchTabularDerivedVariable,
    useFetchTabularServerVariable,
} from './tabular-variable';

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
): Promise<DataFrame | null> {
    if (!isVariable(variable)) {
        return variable;
    }

    if (isSingleVariable(variable)) {
        return resolveVariable(variable, ctx.client, ctx.taskContext, ctx.extras, (v) =>
            ctx.snapshot.getLoadable(v).toPromise()
        );
    }

    if (isServerVariable(variable)) {
        const response = await fetchTabularServerVariable({
            variable,
            // doesn't matter for fetching, will get up to date anyway
            seqNumber: 0,
            wsClient: ctx.client,
            extras: ctx.extras,
        });
        return response.data;
    }

    const resolved = (await resolveVariable(variable, ctx.client, ctx.taskContext, ctx.extras, (v) =>
        ctx.snapshot.getLoadable(v).toPromise()
    )) as ResolvedDerivedVariable;

    // derived variable
    const result = await fetchDerivedVariable({
        cache: variable.cache,
        extras: ctx.extras,
        force_key: null,
        /**
         * In this case we're not concerned about different selectors fetching the value so just use the uid
         */
        selectorKey: resolved.uid,

        values: normalizeRequest(cleanArgs(resolved.values), variable.variables),
        variableUid: resolved.uid,
        wsClient: ctx.client,
    });

    // This is really only used in DownloadVariable currently; we can add support for task
    if (isTaskResponse(result)) {
        throw new UserError('Task DerivedVariables are not supported in this context');
    }

    const response = result.value as DataResponse;
    return response.data;
}
