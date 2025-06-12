import * as React from 'react';

export interface FallbackContext {
    /**
     * Whether to suspend the component when variables are loading. If this is a number, it will defer
     * suspending the component for that many milliseconds.
     */
    suspend: boolean | number;
}

const fallbackCtx = React.createContext<FallbackContext | null>(null);

export function useFallbackCtx(): FallbackContext {
    const ctx = React.useContext(fallbackCtx);

    if (!ctx) {
        throw new Error('useFallback must be used within FallbackCtx');
    }

    return ctx;
}

export default fallbackCtx;
