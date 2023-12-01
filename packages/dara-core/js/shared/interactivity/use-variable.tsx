import { Dispatch, SetStateAction, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecoilStateLoadable, useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE } from 'recoil';

import { VariableCtx, WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import { useDeferLoadable } from '@/shared/utils';
import { Variable, isDataVariable, isDerivedDataVariable, isDerivedVariable, isUrlVariable, isVariable } from '@/types';

import { getOrRegisterPlainVariable, useDerivedVariable, useUrlVariable } from './internal';

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

/**
 * A helper hook that turns a Variable class into the actual value by accessing the appropriate recoil state from the
 * atomRegistry defined above. For convenience, it will also handle a non variable being passed and will return it
 * directly and a noop function for setting it. In most cases components accept a variable or something else, so this
 * helps to clean up all those areas in a consistent manner.
 *
 * @param variable the possible variable to use
 */
export function useVariable<T>(variable: Variable<T> | T): [value: T, update: Dispatch<SetStateAction<T>>] {
    const extras = useRequestExtras();
    const { client: WsClient } = useContext(WebSocketCtx);
    const taskContext = useTaskContext();
    const variablesContext = useContext(VariableCtx);
    const { search } = useLocation();

    if (!isVariable(variable)) {
        return useState(variable);
    }

    // Synchronously register variable subscription, and clean it up on unmount
    variablesContext.variables.current.add(variable.uid);
    useEffect(() => {
        return () => {
            variablesContext.variables.current.delete(variable.uid);
        };
    }, []);

    // This hook should only be used for components not expecting DataFrames
    if (isDataVariable(variable) || isDerivedDataVariable(variable)) {
        throw new Error(`Non-data variable expected, got ${(variable as any).__typename as string}`);
    }

    if (isDerivedVariable(variable)) {
        const selector = useDerivedVariable(variable, WsClient, taskContext, search, extras);
        const selectorLoadable = useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(selector);

        const deferred = useDeferLoadable(selectorLoadable);

        return [deferred.value, warnUpdateOnDerivedState];
    }

    if (isUrlVariable(variable)) {
        return useUrlVariable(variable);
    }

    const recoilState = useMemo(() => getOrRegisterPlainVariable(variable, WsClient, taskContext, search, extras), []);
    const [loadable, setLoadable] = useRecoilStateLoadable(recoilState);
    const deferred = useDeferLoadable(loadable);

    return [deferred, setLoadable];
}
