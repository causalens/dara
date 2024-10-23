/* eslint-disable @typescript-eslint/no-unused-vars */

/* eslint-disable react/no-unused-prop-types */

/* eslint-disable import/no-extraneous-dependencies */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RenderOptions, RenderResult, render } from '@testing-library/react';
import { History, createMemoryHistory } from 'history';
import noop from 'lodash/noop';
import React, { ComponentType, ReactElement, useRef } from 'react';
import { Router } from 'react-router-dom';
import { RecoilRoot } from 'recoil';
import { RecoilURLSync } from 'recoil-sync';

import { ThemeProvider, theme } from '@darajs/styled-components';

import { StoreProviders } from '@/shared/interactivity/persistence';
import { useUrlSync } from '@/shared/utils';

import { NavigateTo, ResetVariables, TriggerVariable, UpdateVariable } from '../../../js/actions';
import { WebSocketClientInterface } from '../../../js/api/websocket';
import { ImportersCtx } from '../../../js/shared';
import { FallbackCtx, GlobalTaskProvider, RegistriesCtx, VariableCtx, WebSocketCtx } from '../../../js/shared/context';
import { ComponentInstance } from '../../../js/types';
import MockWebSocketClient from './mock-web-socket-client';
import { mockActions, mockComponents } from './test-server-handlers';

// A Mock template root component that lists the names of the provided templateCtx
interface TemplateRootProps {
    frame: ComponentInstance;
    menu: ComponentInstance;
}

function TemplateRoot(props: TemplateRootProps): JSX.Element {
    return (
        <span>
            {Object.values(props)
                .filter((val) => typeof val === 'object' && 'name' in val) // only pass frame and menu (ignores UID)
                .map(({ name }) => name)
                .join(', ')}
        </span>
    );
}

// Mock importers for testing dynamic components
const importers = {
    dara_core: () =>
        Promise.resolve({
            NavigateTo,
            ResetVariables,
            TemplateRoot,
            TriggerVariable,
            UpdateVariable,
        }),
    test: () => Promise.resolve({ TestComponent: 'div' }),
};

const wsClient = new MockWebSocketClient('uid');

interface WrapperProps {
    children?: React.ReactNode;
    client?: WebSocketClientInterface;
    history?: History;
    withRouter?: boolean;
    withTaskCtx?: boolean;
}

// A wrapper for testing that provides some required contexts
export const Wrapper = ({
    children,
    client,
    withRouter = true,
    withTaskCtx = true,
    history,
}: WrapperProps): ReactElement => {
    // the client needs to be created inside the wrapper so cache is not shared between tests
    const queryClient = new QueryClient();
    const historyObject = history ?? createMemoryHistory();

    const variables = useRef<Set<string>>(new Set());
    const syncOptions = useUrlSync({ history: historyObject, memory_TEST: true });

    let child = children;

    if (withRouter) {
        child = <Router history={historyObject}>{child}</Router>;
    }

    if (withTaskCtx) {
        child = (
            <GlobalTaskProvider>
                <VariableCtx.Provider value={{ variables }}>{child}</VariableCtx.Provider>
            </GlobalTaskProvider>
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <ImportersCtx.Provider value={importers}>
                <WebSocketCtx.Provider value={{ client: client ?? wsClient }}>
                    <RecoilRoot>
                        <RecoilURLSync {...syncOptions}>
                            <React.Suspense fallback={<div>Loading...</div>}>
                                <QueryClientProvider client={queryClient}>
                                    <RegistriesCtx.Provider
                                        value={{
                                            actionRegistry: mockActions,
                                            componentRegistry: mockComponents,
                                            refetchComponents: noop as any,
                                        }}
                                    >
                                        <StoreProviders>
                                            <FallbackCtx.Provider value={{ suspend: true }}>
                                                {child}
                                            </FallbackCtx.Provider>
                                        </StoreProviders>
                                    </RegistriesCtx.Provider>
                                </QueryClientProvider>
                            </React.Suspense>
                        </RecoilURLSync>
                    </RecoilRoot>
                </WebSocketCtx.Provider>
            </ImportersCtx.Provider>
        </ThemeProvider>
    );
};

function wrappedRender(ui: React.ReactElement, options?: RenderOptions): RenderResult {
    return render(ui, { wrapper: Wrapper as ComponentType, ...options });
}

export default wrappedRender;
