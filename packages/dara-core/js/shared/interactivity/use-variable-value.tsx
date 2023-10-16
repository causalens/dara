/* eslint-disable react-hooks/rules-of-hooks */
import { Snapshot } from 'recoil';

// eslint-disable-next-line import/no-cycle
import { WebSocketClientInterface } from '@/api/websocket';
import { normalizeRequest } from '@/shared/utils/normalization';
import {
    AnyVariable,
    DataFrame,
    DerivedDataVariable,
    DerivedVariable,
    ResolvedDataVariable,
    ResolvedDerivedDataVariable,
    ResolvedDerivedVariable,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isResolvedDataVariable,
    isResolvedDerivedDataVariable,
    isResolvedDerivedVariable,
} from '@/types';

import { GlobalTaskContext } from '../context/global-task-context';
import {
    fetchDataVariable,
    fetchDerivedDataVariable,
    fetchDerivedVariable,
    formatDerivedVariableRequest,
    isTaskResponse,
    resolveVariable,
} from './internal';

type GetVariableValueCtx = {
    client: WebSocketClientInterface;
    search: string;
    snapshot: Snapshot;
    taskContext: GlobalTaskContext;
    token: string;
};

/**
 * Helper function that returns the current value of a variable.
 *
 * Plain variables are always resolved to their value.
 * Computed (server-side) variables are resolved to their uid and dependency values, unless shouldFetchVariable is true.
 */
export function getVariableValue<VV, B extends boolean = false>(
    variable: AnyVariable<VV>,
    shouldFetchVariable: B = false as B,
    ctx: GetVariableValueCtx
):
    | VV
    | DataFrame
    | ResolvedDataVariable
    | ResolvedDerivedVariable
    | ResolvedDerivedDataVariable
    | Promise<VV>
    | Promise<DataFrame> {
    // Using loadable since the resolver is only used for simple atoms and shouldn't cause problems
    const resolved = resolveVariable<any>(variable, ctx.client, ctx.taskContext, ctx.search, ctx.token, (v) =>
        ctx.snapshot.getLoadable(v).getValue()
    );

    // if we're NOT forced to fetch, or if it's not a DV/DDV/data variable, return the resolved value
    // variable is plain/url
    if (
        !shouldFetchVariable ||
        (!isDerivedVariable(variable) && !isDataVariable(variable) && !isDerivedDataVariable(variable))
    ) {
        return resolved;
    }

    // we're forced to fetch but the resolved variable is not a resolved DV/data var, return the resolved value
    // variable is plain/url
    if (
        !isResolvedDerivedVariable(resolved) &&
        !isResolvedDataVariable(resolved) &&
        !isResolvedDerivedDataVariable(resolved)
    ) {
        return resolved;
    }

    // data variable
    if (isResolvedDataVariable(resolved)) {
        return fetchDataVariable(resolved.uid, ctx.token, resolved.filters);
    }

    // derived variable
    return fetchDerivedVariable({
        cache: (variable as DerivedVariable | DerivedDataVariable).cache,
        force: false,
        token: ctx.token,
        uid: resolved.uid,
        values: normalizeRequest(
            formatDerivedVariableRequest(resolved.values),
            (variable as DerivedVariable | DerivedDataVariable).variables
        ),
        wsClient: ctx.client,
    }).then((resp) => {
        // This is really only used in DownloadVariable currently; we can add support for tasks
        // if it is requested in the future
        if (isTaskResponse(resp)) {
            throw new Error('Task DerivedVariables are not supported in this context');
        }

        // for derived data variables we need to make another request to retrieve the filtered value
        if (isDerivedDataVariable(variable)) {
            return ctx.client
                .getChannel()
                .then((chan) =>
                    fetchDerivedDataVariable(variable.uid, ctx.token, resp.cache_key, chan, variable.filters)
                );
        }

        return resp.value;
    }) as Promise<VV>;
}
