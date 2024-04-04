/* eslint-disable react-hooks/rules-of-hooks */

/* eslint-disable react-hooks/exhaustive-deps */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { AnyDataVariable, AnyVariable, DataFrame, isDataVariable, isDerivedDataVariable } from '@/types';

import { useDataVariable } from './use-data-variable';
import { useVariable } from './use-variable';

/**
 * A helper hook to retrieve value of any variable.
 * For the rare occassions where a component can accept both a DataVariable and a non-DataVariable.
 */
export function useAnyVariable(variable: AnyDataVariable): DataFrame;
export function useAnyVariable<T = any>(variable: AnyVariable<T>): T;
export function useAnyVariable<T = any>(variable: AnyVariable<T>): DataFrame | T {
    if (isDataVariable(variable) || isDerivedDataVariable(variable)) {
        const getData = useDataVariable(variable);

        const { data, refetch } = useQuery({
            // ideally would be 0 but that causes infinite loops, see https://github.com/TanStack/query/issues/2367
            cacheTime: 1,
            queryFn: async () => {
                const dataResponse = await getData();
                return dataResponse.data;
            },
            queryKey: ['any-variable-data', variable.uid],
            refetchOnWindowFocus: false,
            suspense: true,
        });

        useEffect(() => {
            // Refetch when getData changes
            refetch();
        }, [getData]);

        return data;
    }

    return useVariable(variable)[0];
}
