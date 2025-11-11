import { generatePath } from 'react-router';

import { useVariable } from '@/shared';
import { resolveVariable } from '@/shared/interactivity/resolve-variable';
import { type ActionContext, type RouterPath, isVariable } from '@/types';

/**
 * Resolve a "To" value.
 * This resolves extra 'params' variables in the path to their values.
 * It's a noop for strings or path objects with no params.
 *
 * NOTE: This calls useVariable on each param, be careful about rules-of-hooks
 *
 * @param path the path to resolve
 */
export function useResolvedTo(path: string | Partial<RouterPath>): string | Partial<RouterPath> {
    if (typeof path === 'string') {
        return path;
    }

    if (!path.params || !path.pathname) {
        return path;
    }

    const resolvedParams = Object.fromEntries(
        // eslint-disable-next-line react-hooks/rules-of-hooks
        Object.entries(path.params).map(([key, value]) => [key, useVariable(value)[0]])
    );
    const resolvedPath = generatePath(path.pathname, resolvedParams);
    return { ...path, pathname: resolvedPath };
}

export async function resolveTo(
    path: string | Partial<RouterPath>,
    ctx: ActionContext
): Promise<string | Partial<RouterPath>> {
    if (typeof path === 'string') {
        return path;
    }

    if (!path.params || !path.pathname) {
        return path;
    }

    const values = await Promise.all(
        Object.values(path.params).map((value) => {
            if (!isVariable(value)) {
                return Promise.resolve(value);
            }

            return resolveVariable(value, ctx.wsClient, ctx.taskCtx, ctx.extras, (v) => ctx.snapshot.getPromise(v));
        })
    );
    // zip new values with param keys
    const resolvedParams = Object.fromEntries(Object.keys(path.params).map((key, idx) => [key, values[idx]]));
    const resolvedPath = generatePath(path.pathname, resolvedParams);
    return { ...path, pathname: resolvedPath };
}
