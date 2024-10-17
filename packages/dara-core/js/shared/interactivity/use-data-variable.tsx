/* eslint-disable react-hooks/rules-of-hooks */

/* eslint-disable react-hooks/exhaustive-deps */
import { useContext, useEffect, useMemo, useState } from 'react';
import { useRecoilValueLoadable } from 'recoil';

// eslint-disable-next-line import/no-cycle
import { VariableCtx, WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import { AnyDataVariable, FilterQuery, Pagination, isDataVariable } from '@/types';

import {
    DataResponse,
    DerivedVariableValueResponse,
    registerDataVariable,
    useDerivedVariable,
    useFetchDataVariable,
    useFetchDerivedDataVariable,
} from './internal';

/**
 * Helper hook which turns a (Derived)DataVariable into a callback to return DataFrame.
 * Can be used in components that only work with data variables.
 *
 * Optionally pass in filters, pagination, and other options to fetch data.
 * Other options include:
 * -     schema: boolean - whether to include schema in the response. Default = false.
 *
 * The callback identity changes whenever a refetch should be triggered.
 *
 * @param variable data variable
 */
export function useDataVariable(
    variable: AnyDataVariable
): (filters?: FilterQuery, pagination?: Pagination, options?: { schema: boolean }) => Promise<DataResponse> {
    const extras = useRequestExtras();
    const { client: wsClient } = useContext(WebSocketCtx);

    if (isDataVariable(variable)) {
        registerDataVariable(variable);
        const serverTriggers$ = useMemo(() => wsClient.serverTriggers$(variable.uid), []);
        const [serverTriggerCounter, setServerTriggerCounter] = useState(0);
        useEffect(() => {
            const sub = serverTriggers$.subscribe(() => setServerTriggerCounter((c) => c + 1));

            return () => sub.unsubscribe();
        }, [serverTriggers$]);

        const fetchDataVariable = useFetchDataVariable(variable, serverTriggerCounter);

        return fetchDataVariable;
    }

    // Synchronously register subscription to the underlying DV, clean up on unmount
    const variablesContext = useContext(VariableCtx);
    variablesContext.variables.current.add(variable.uid);
    useEffect(() => {
        return () => {
            variablesContext.variables.current.delete(variable.uid);
        };
    }, []);

    const taskContext = useTaskContext();

    const dvSelector = useDerivedVariable(variable, wsClient, taskContext, extras);
    const dvLoadable = useRecoilValueLoadable(dvSelector);

    // We can't directly use the loadable as the callback's dependency because the loadable identity
    // changes whenever it also changes state; we only want to update it when there is a new value
    const [dvValue, setDvValue] = useState<Promise<DerivedVariableValueResponse<any>>>(dvLoadable.toPromise());
    useEffect(() => {
        // Whenever loadable becomes loading update the promise stored
        if (dvLoadable.state === 'loading') {
            setDvValue(dvLoadable.toPromise());
        }
    }, [dvLoadable]);

    const fetchDerivedDataVariable = useFetchDerivedDataVariable(variable, taskContext, wsClient, dvValue);

    return fetchDerivedDataVariable;
}
