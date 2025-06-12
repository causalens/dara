import { type Dispatch, type SetStateAction, useContext, useEffect, useState } from 'react';
import { useRecoilState, useRecoilStateLoadable, useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE } from 'recoil';

import { VariableCtx, WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import useDeferLoadable from '@/shared/utils/use-defer-loadable';
import {
    type Variable,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isUrlVariable,
    isVariable,
} from '@/types';

import { useEventBus } from '../event-bus/event-bus';
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

        if (variable !== prevVariable) {
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

    // This hook should only be used for components not expecting DataFrames
    if (isDataVariable(variable) || isDerivedDataVariable(variable)) {
        throw new Error(`Non-data variable expected, got ${(variable as any).__typename as string}`);
    }

    if (isDerivedVariable(variable)) {
        const selector = useDerivedVariable(variable, wsClient, taskContext, extras);
        const selectorLoadable = useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(selector);

        useEffect(() => {
            if (selectorLoadable.state !== 'loading') {
                bus.publish('DERIVED_VARIABLE_LOADED', { variable, value: selectorLoadable.contents });
            }
        }, [selectorLoadable]);

        const deferred = useDeferLoadable(selectorLoadable);

        return [deferred.value, warnUpdateOnDerivedState];
    }

    if (isUrlVariable(variable)) {
        const [urlValue, setUrlValue] = useUrlVariable<T>(variable);

        useEffect(() => {
            bus.publish('URL_VARIABLE_LOADED', { variable, value: urlValue });
        }, [urlValue]);

        return [urlValue, setUrlValue as Dispatch<SetStateAction<T>>];
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

    const deferred = useDeferLoadable(loadable);

    return [deferred, setLoadable];
}
