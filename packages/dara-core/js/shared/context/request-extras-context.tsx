import { createContext, useContext, useMemo } from 'react';

import { useDeepCompare } from '@darajs/ui-utils';

import { RequestExtras } from '@/api/http';
import { useSessionToken } from '@/auth/auth-context';

interface RequestExtrasCtx {
    options: RequestInit;
}

const requestExtrasCtx = createContext<RequestExtrasCtx>({ options: {} });

export default requestExtrasCtx;

/**
 * Get request extras to be passed into request function.
 * Uses auth context for session token and merges with the options provided by the request extras provider.
 */
export function useRequestExtras(): RequestExtras {
    const sessionToken = useSessionToken();
    const { options } = useContext(requestExtrasCtx);

    const extras = useMemo(() => {
        return {
            options,
            sessionToken,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [useDeepCompare(options), sessionToken]);

    return extras;
}

/**
 * Request extras provider that sets the default options for all requests.
 */
export function RequestExtrasProvider({
    children,
    options,
}: {
    children: React.ReactNode;
    options: RequestInit;
}): JSX.Element {
    return <requestExtrasCtx.Provider value={{ options }}>{children}</requestExtrasCtx.Provider>;
}

/**
 * Request extras provider which merges the provided options with the parent options.
 */
export function PartialRequestExtrasProvider({
    children,
    options,
}: {
    children: React.ReactNode;
    options: RequestInit;
}): JSX.Element {
    const { options: parentOptions } = useContext(requestExtrasCtx);

    return (
        <requestExtrasCtx.Provider value={{ options: { ...parentOptions, ...options } }}>
            {children}
        </requestExtrasCtx.Provider>
    );
}
