import { useSuspenseQuery } from '@tanstack/react-query';
import isEqual from 'lodash/isEqual';
import { type Dispatch, type SetStateAction, useContext, useEffect, useMemo, useState } from 'react';
import {
    useRecoilState,
    useRecoilStateLoadable,
    useRecoilValueLoadable,
    useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE,
} from 'recoil';

import { VariableCtx, WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import useDeferLoadable from '@/shared/utils/use-defer-loadable';
import {
    UserError,
    type Variable,
    isDerivedVariable,
    isServerVariable,
    isStateVariable,
    isStreamVariable,
    isSwitchVariable,
    isVariable,
} from '@/types';

import { useEventBus } from '../event-bus/event-bus';

// eslint-disable-next-line import/no-cycle
import {
    getOrRegisterPlainVariable,
    getOrRegisterServerVariable,
    useDerivedVariable,
    useSwitchVariable,
} from './internal';
import { findStreamVariables } from './find-stream-variables';
import { getOrRegisterStreamVariable } from './stream-variable';
import { useStreamSubscription } from './use-stream-subscription';
import { useTabularVariable } from './use-tabular-variable';

/** Disabling rules of hook because of assumptions that variables never change their types which makes the hook order consistent */
/* eslint-disable react-hooks/rules-of-hooks */
/** Disabling no-use-before-define because of functions depending on each other */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react-hooks/exhaustive-deps */

/**
 * Helper function to warn when trying to update DerivedVariable directly
 */
function warnUpdateOnDerivedState(): void {
    // eslint-disable-next-line no-console
    console.warn('You tried to call update on variable with derived state, this is a noop and will be ignored.');
}

export interface UseVariableOptions {
    /**
     * Defines how server variables should be handled.
     * - disallow: disallow server variables from being used in this component
     * - one-row: fetches the first row of the server variable and uses that as the value.
     *       Useful for e.g. condition truthiness checks for non-emptiness
     */
    serverVariable?: 'disallow' | 'one-row';
    suspend?: boolean | number;
}

/**
 * A helper hook that turns a Variable class into the actual value by accessing the appropriate recoil state from the
 * atomRegistry defined above. For convenience, it will also handle a non variable being passed and will return it
 * directly and a noop function for setting it. In most cases components accept a variable or something else, so this
 * helps to clean up all those areas in a consistent manner.
 *
 * @param variable the possible variable to use
 */
export function useVariable<T>(
    variable: Variable<T> | T,
    opts: UseVariableOptions = { serverVariable: 'disallow' }
): [value: T, update: Dispatch<SetStateAction<T>>] {
    const extras = useRequestExtras();

    const { client: wsClient } = useContext(WebSocketCtx);
    const taskContext = useTaskContext();
    const variablesContext = useContext(VariableCtx);
    const bus = useEventBus();

    // if it's a primitive, use it as a piece of state
    if (!isVariable(variable)) {
        const [state, setState] = useState(variable);

        // Keep track of the last passed through primitive value
        // When it changes, adjust the state to the new value
        const [prevVariable, setPrevVariable] = useState(variable);

        // uses lodash just to be sure, most cases the reference check will short circuit this
        // but for objects/arrays we want to check the actual value
        if (!isEqual(variable, prevVariable)) {
            setState(variable);
            setPrevVariable(variable);
        }

        return [state, setState];
    }

    // Synchronously register variable subscription, and clean it up on unmount
    variablesContext?.variables.current.add(variable.uid);
    useEffect(() => {
        return () => {
            variablesContext?.variables.current.delete(variable.uid);
        };
    }, []);

    // Find all StreamVariables in the dependency tree and subscribe to them
    // This runs in useEffect - the SSE starts immediately in atom effect,
    // this just tracks active users so we know when to cleanup
    // Keyed by uid+extras so different auth contexts are independent
    const streamUids = useMemo(() => findStreamVariables(variable).map((s) => s.uid), [variable.uid]);
    useStreamSubscription(streamUids, extras);

    if (isDerivedVariable(variable)) {
        const selector = useDerivedVariable(variable, wsClient, taskContext, extras);
        const selectorLoadable = useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(selector);

        useEffect(() => {
            if (selectorLoadable.state !== 'loading') {
                bus.publish('DERIVED_VARIABLE_LOADED', { variable, value: selectorLoadable.contents });
            }
        }, [selectorLoadable]);

        const deferred = useDeferLoadable(selectorLoadable, opts.suspend);

        return [deferred, warnUpdateOnDerivedState];
    }

    if (isSwitchVariable(variable)) {
        return [useSwitchVariable(variable), warnUpdateOnDerivedState];
    }

    if (isStateVariable(variable)) {
        const parentSelector = useDerivedVariable(variable.parent_variable, wsClient, taskContext, extras);
        const parentLoadable = useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(parentSelector);

        // Map the loadable state to the specific property
        let stateValue: boolean;
        switch (variable.property_name) {
            case 'loading':
                stateValue = parentLoadable.state === 'loading';
                break;
            case 'error':
                stateValue = parentLoadable.state === 'hasError';
                break;
            case 'hasValue':
                stateValue = parentLoadable.state === 'hasValue';
                break;
            default:
                stateValue = false;
        }

        return [stateValue as T, warnUpdateOnDerivedState];
    }

    if (isServerVariable(variable)) {
        if (opts.serverVariable === 'disallow') {
            throw new UserError('ServerVariable cannot be directly consumed by this component');
        }

        // assume one-row behaviour
        const atom = useMemo(() => getOrRegisterServerVariable(variable, extras), [variable, extras]);
        const [seqNumber] = useRecoilState(atom);
        const fetcher = useTabularVariable(variable);
        // convert the fetcher to a suspended query to match recoil behaviour
        const { data } = useSuspenseQuery({
            // use the seq number as a dependency to refetch on changes
            queryKey: ['use-variable-server-variable', variable.uid, seqNumber],
            queryFn: async () => {
                const result = await fetcher(null, {
                    limit: 1,
                    offset: 0,
                });
                return result.data;
            },
            refetchOnWindowFocus: false,
        });
        return [(data?.[0] ?? null) as T, warnUpdateOnDerivedState];
    }

    if (isStreamVariable(variable)) {
        const selector = getOrRegisterStreamVariable(variable, wsClient, taskContext, extras);
        // Use the standard loadable + useDeferLoadable pattern.
        // This works because we use the recoil-sync pattern: setSelf(promise) in the atom effect
        // which enables native Recoil Suspense handling.
        const selectorLoadable = useRecoilValueLoadable(selector);
        const deferred = useDeferLoadable(selectorLoadable, opts.suspend);
        return [deferred as T, warnUpdateOnDerivedState];
    }

    const recoilState = getOrRegisterPlainVariable(variable, wsClient, taskContext, extras);
    if (!isDerivedVariable(variable.default)) {
        const [value, setValue] = useRecoilState(recoilState);
        useEffect(() => {
            bus.publish('PLAIN_VARIABLE_LOADED', { variable, value });
        }, [value]);
        return [value, setValue];
    }
    const [loadable, setLoadable] = useRecoilStateLoadable(recoilState);
    useEffect(() => {
        // when loadable resolves to a value/error
        if (loadable.state !== 'loading') {
            bus.publish('PLAIN_VARIABLE_LOADED', { variable, value: loadable.contents });
        }
    }, [loadable]);

    const deferred = useDeferLoadable(loadable, opts.suspend);

    return [deferred, setLoadable];
}
