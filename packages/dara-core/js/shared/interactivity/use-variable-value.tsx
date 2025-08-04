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
    type ServerVariable,
    UserError,
    isDerivedVariable,
    isResolvedDerivedVariable,
    isResolvedServerVariable,
    isResolvedSwitchVariable,
    isServerVariable,
    isSingleVariable,
    isStateVariable,
    isSwitchVariable,
} from '@/types';

import {
    cleanArgs,
    fetchDerivedVariable,
    fetchTabularServerVariable,
    isTaskResponse,
    resolveVariable,
} from './internal';

export type GetVariableValueCtx = {
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
 * Computed (server-side) variables are resolved to their uid and dependency values.
 */
export function getVariableValue<VV>(
    variable: AnyVariable<VV>,
    ctx: GetVariableValueCtx
): VV | ResolvedDerivedVariable | ResolvedServerVariable | Promise<VV> {
    if (isSwitchVariable(variable) || isStateVariable(variable)) {
        throw new UserError(`${variable.__typename} is not supported in this context`);
    }

    const resolved = resolveVariable<any>(variable, ctx.client, ctx.taskContext, ctx.extras, (v) =>
        ctx.snapshot.getLoadable(v).getValue()
    );

    if (isSingleVariable(variable)) {
        return resolved;
    }

    return resolved;
}
