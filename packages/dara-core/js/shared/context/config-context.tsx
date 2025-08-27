import { createContext, useContext, useMemo } from 'react';

import type { Config } from '@/types';

interface ConfigContext {
    config: Config;
}

const configContext = createContext<ConfigContext | null>(null);

export function ConfigContextProvider(props: { initialConfig: Config; children: React.ReactNode }): React.ReactNode {
    const contextValue = useMemo(() => ({ config: props.initialConfig }), [props.initialConfig]);
    return <configContext.Provider value={contextValue}>{props.children}</configContext.Provider>;
}

export function useConfig(): Config {
    const context = useContext(configContext);

    if (!context) {
        throw new Error('useConfigContext must be used within a ConfigContextProvider');
    }

    return context.config;
}
