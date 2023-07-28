import noop from 'lodash/noop';
import * as React from 'react';

export interface AuthCtxInterface {
    /**
     * Setter for the session token
     */
    setToken: React.Dispatch<React.SetStateAction<string>>;
    /**
     * Session token
     */
    token: string;
}

const authCtx = React.createContext<AuthCtxInterface>({ setToken: noop, token: '' });

/**
 * Hook to get the auth context
 */
export function useAuthCtx(): AuthCtxInterface {
    return React.useContext(authCtx);
}

/**
 * Helper hook that pulls the session token from context and returns it's value
 */
export function useSessionToken(): string {
    const { token } = React.useContext(authCtx);
    return token;
}

export default authCtx;
