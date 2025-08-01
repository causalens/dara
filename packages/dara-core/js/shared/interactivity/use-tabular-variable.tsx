/* eslint-disable react-hooks/rules-of-hooks */

/* eslint-disable react-hooks/exhaustive-deps */
import { useContext, useEffect, useMemo, useState } from 'react';
import { useRecoilValue, useRecoilValueLoadable } from 'recoil';

// eslint-disable-next-line import/no-cycle
import { VariableCtx, WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import {
    type DataFrame,
    type DerivedVariable,
    type ServerVariable,
    type SingleVariable,
    isServerVariable,
    isSingleVariable,
    isVariable,
} from '@/types';

import { createFetcher } from './filtering';
import { type DerivedResult, getOrRegisterDerivedVariableResult, useVariable } from './internal';
import { getOrRegisterServerVariable } from './server-variable';
import { type DataFetcher, useFetchTabularDerivedVariable, useFetchTabularServerVariable } from './tabular-variable';

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
