/* eslint-disable react-hooks/rules-of-hooks */
import { type Snapshot } from 'recoil';

// eslint-disable-next-line import/no-cycle
import { type WebSocketClientInterface } from '@/api';
import { type RequestExtras } from '@/api/http';
import { normalizeRequest } from '@/shared/utils/normalization';
import {
    type AnyVariable,
    type DataFrame,
    type DerivedVariable,
    type GlobalTaskContext,
    type ResolvedDerivedVariable,
    type ResolvedServerVariable,
    type ResolvedSwitchVariable,
    UserError,
    isDerivedVariable,
    isResolvedDerivedVariable,
    isResolvedServerVariable,
    isResolvedSwitchVariable,
    isServerVariable,
} from '@/types';

import { cleanArgs, fetchDerivedVariable, isTaskResponse, resolveVariable } from './internal';

type GetVariableValueCtx = {
    client: WebSocketClientInterface;
    extras: RequestExtras;
    search: string;
    snapshot: Snapshot;
    taskContext: GlobalTaskContext;
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
    | ResolvedDerivedVariable
    | ResolvedSwitchVariable
    | ResolvedServerVariable
    | Promise<VV>
    | Promise<DataFrame> {
    // Using loadable since the resolver is only used for simple atoms and shouldn't cause problems
    const resolved = resolveVariable<any>(variable, ctx.client, ctx.taskContext, ctx.extras, (v) =>
        ctx.snapshot.getLoadable(v).getValue()
    );

    if (isResolvedSwitchVariable(resolved)) {
        throw new UserError('Switch variables are not supported in this context');
    }

    // if we're NOT forced to fetch, or if it's not a DV/Server variable, return the resolved value
    // variable is plain/url
    if (!shouldFetchVariable || (!isDerivedVariable(variable) && !isServerVariable(variable))) {
        return resolved;
    }

    // we're forced to fetch but the resolved variable is not a resolved DV/data var, return the resolved value
    // variable is plain/switch
    if (!isResolvedDerivedVariable(resolved) && !isResolvedServerVariable(resolved)) {
        return resolved;
    }

    // server variable
    if (isResolvedServerVariable(resolved)) {
        // TODO: fetch entire server var?
        // return fetchDataVariable(resolved.uid, ctx.extras, resolved.filters);
        return null as any;
    }

    // derived variable
    return fetchDerivedVariable({
        cache: (variable as DerivedVariable).cache,
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
