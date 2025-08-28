import { useMutation } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api/http';
import { handleAuthErrors } from '@/auth/auth';
import { type ActionDef, type Component, type ComponentInstance } from '@/types';

import { useRequestExtras } from './request-extras-context';

type RegistriesCtx = {
    /**
     * Action registry
     */
    actionRegistry: Record<string, ActionDef>;
    /**
     * Component registry
     */
    componentRegistry: Record<string, Component>;
    /**
     * Callback to get a component from the components registry
     */
    getComponent: (instance: ComponentInstance) => Promise<Component>;
};

const registriesCtx = createContext<RegistriesCtx | null>(null);

export function RegistriesCtxProvider(props: {
    componentRegistry: Record<string, Component>;
    actionRegistry: Record<string, ActionDef>;
    children: React.ReactNode;
}): React.ReactNode {
    const [actionRegistry] = useState<Record<string, ActionDef>>(props.actionRegistry);
    const [componentRegistry, setComponentRegistry] = useState<Record<string, Component>>(props.componentRegistry);
    const extras = useRequestExtras();

    const refetchComponentMutation = useMutation<Component, Error, { name: string }>({
        mutationKey: ['component-definition'],
        mutationFn: async ({ name }) => {
            const response = await request(
                `/api/core/components/${name}/definition`,
                { method: HTTP_METHOD.GET },
                extras
            );
            await handleAuthErrors(response, true);
            await validateResponse(response, `Failed to fetch the component definition for ${name}, was it registered in the app?`);
            return response.json();
        },
        retry: 3,
    });

    const getComponent = useCallback(
        async (instance: ComponentInstance): Promise<Component> => {
            if (componentRegistry[instance.name]) {
                return componentRegistry[instance.name]!;
            }

            const component = await refetchComponentMutation.mutateAsync({ name: instance.name });
            setComponentRegistry((prev) => ({ ...prev, [instance.name]: component }));
            return component;
        },
        [componentRegistry, refetchComponentMutation]
    );

    const contextValue = useMemo(
        () => ({ actionRegistry, componentRegistry, getComponent }),
        [actionRegistry, componentRegistry, getComponent]
    );

    return <registriesCtx.Provider value={contextValue}>{props.children}</registriesCtx.Provider>;
}

export function useRegistriesCtx(): RegistriesCtx {
    const context = useContext(registriesCtx);

    if (!context) {
        throw new Error('useRegistriesCtx must be used within a RegistriesCtxProvider');
    }

    return context;
}
