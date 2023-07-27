import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { ServerErrorMessage } from '@/api/websocket';
import WebSocketCtx from '@/shared/context/websocket-context';

/**
 * Helper hook to subscribe to errors coming from the backend
 */
function useBackendErrorsSubscription(): [ServerErrorMessage['message'][], () => void] {
    const [errors, setErrors] = useState([]);
    const { client } = useContext(WebSocketCtx);

    useEffect(() => {
        const sub = client.serverErrors$().subscribe((err) => {
            setErrors((prev) => [...prev, err.message]);
        });

        return () => {
            sub.unsubscribe();
        };
    });

    const clearErrors = useCallback(() => {
        setErrors([]);
    }, []);

    return [errors, clearErrors];
}

interface BackendErrorContext {
    clearErrors: () => void;
    errors: ServerErrorMessage['message'][];
}

const BackendErrorsCtx = createContext<BackendErrorContext>(null);

/**
 * Provides a live stream of backend errors
 */
export function BackendErrorsProvider(props: { children: JSX.Element }): JSX.Element {
    const [errors, clearErrors] = useBackendErrorsSubscription();

    return <BackendErrorsCtx.Provider value={{ clearErrors, errors }}>{props.children}</BackendErrorsCtx.Provider>;
}

/**
 * Get the current backend errors from context
 */
export function useBackendErrors(): BackendErrorContext {
    return useContext(BackendErrorsCtx);
}
