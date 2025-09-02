/* eslint-disable @typescript-eslint/no-unused-vars */

/* eslint-disable react/no-unused-prop-types */

/* eslint-disable import/no-extraneous-dependencies */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, type RenderResult, render } from '@testing-library/react';
import React, { type ComponentType, type ReactElement, type ReactNode, useEffect, useRef } from 'react';
import { useState } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { RecoilRoot } from 'recoil';
import { RecoilURLSync } from 'recoil-sync';

import { ThemeProvider, theme } from '@darajs/styled-components';

import { PathParamSync, StoreProviders } from '@/shared/interactivity/persistence';
import { preloadActions } from '@/shared/interactivity/use-action';
import { useUrlSync } from '@/shared/utils';

import { NavigateTo, ResetVariables, TriggerVariable, UpdateVariable } from '../../../js/actions';
import { type WebSocketClientInterface } from '../../../js/api/websocket';
import { ImportersCtx, ServerVariableSyncProvider } from '../../../js/shared';
import {
    ConfigContextProvider,
    FallbackCtx,
    GlobalTaskProvider,
    RegistriesCtxProvider,
    VariableCtx,
    WebSocketCtx,
} from '../../../js/shared/context';
import { type ComponentInstance, type DaraData, type ModuleContent } from '../../../js/types';
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
export const importers: Record<string, () => Promise<ModuleContent>> = {
    dara_core: () =>
        Promise.resolve({
            NavigateTo,
            ResetVariables,
            TemplateRoot,
            TriggerVariable,
            UpdateVariable,
        }),
    test: () =>
        Promise.resolve({
            TestComponent: 'div' as any,
            TestPropsComponent: (props: any) => <div>{JSON.stringify(props)}</div>,
        }),
};

const wsClient = new MockWebSocketClient('uid');

interface WrapperProps {
    children?: React.ReactNode;
    client?: WebSocketClientInterface;
    withRouter?: boolean;
    withTaskCtx?: boolean;
}

function UrlSyncProvider(props: { children: React.ReactNode }): React.ReactNode {
    const syncOptions = useUrlSync();
    return <RecoilURLSync {...syncOptions}>{props.children}</RecoilURLSync>;
}

declare global {
    interface Window {
        dara: DaraGlobals;
    }
}

interface DaraGlobals {
    base_url: string;
    ws?: WebSocketClientInterface;
}

export const daraData: DaraData = {
    auth_components: {
        login: {
            js_module: '@darajs/dara_core',
            js_name: 'DefaultAuthLogin',
            py_module: 'dara_core',
        },
        logout: {
            js_module: '@darajs/dara_core',
            js_name: 'DefaultAuthLogout',
            py_module: 'dara_core',
        },
    },
    application_name: 'Test App',
    context_components: [],
    enable_devtools: false,
    live_reload: false,
    powered_by_causalens: false,
    router: {
        children: [],
    },
    theme: { base: 'dark', main: 'dark' },
    title: 'Test App',
    components: mockComponents,
    actions: mockActions,
};

// A wrapper for testing that provides some required contexts
export const Wrapper = ({ children, client, withRouter = true, withTaskCtx = true }: WrapperProps): ReactNode => {
    // the client needs to be created inside the wrapper so cache is not shared between tests
    const queryClient = new QueryClient();

    const variables = useRef<Set<string>>(new Set());

    let child = children;

    const [isReady, setIsReady] = useState(false);

    if (withRouter) {
        const router = createBrowserRouter([
            {
                path: '*',
                // url sync only works with the router
                element: (
                    <UrlSyncProvider>
                        <PathParamSync>{child}</PathParamSync>
                    </UrlSyncProvider>
                ),
            },
        ]);
        child = <RouterProvider router={router} />;
    }

    if (withTaskCtx) {
        child = (
            <GlobalTaskProvider>
                <VariableCtx.Provider value={{ variables }}>{child}</VariableCtx.Provider>
            </GlobalTaskProvider>
        );
    }

    if (!window.dara) {
        window.dara = {
            base_url: '',
        };
    }
    window.dara.ws = wsClient;

    return (
        <ConfigContextProvider
            initialConfig={{
                auth_components: {
                    login: {
                        js_module: '@darajs/dara_core',
                        js_name: 'DefaultAuthLogin',
                        py_module: 'dara_core',
                    },
                    logout: {
                        js_module: '@darajs/dara_core',
                        js_name: 'DefaultAuthLogout',
                        py_module: 'dara_core',
                    },
                },
                application_name: 'Test App',
                context_components: [],
                enable_devtools: false,
                live_reload: false,
                powered_by_causalens: false,
                router: {
                    children: [],
                },
                theme: { base: 'dark', main: 'dark' },
                title: 'Test App',
            }}
        >
            <QueryClientProvider client={queryClient}>
                <ThemeProvider theme={theme}>
                    <ImportersCtx.Provider value={importers}>
                        <WebSocketCtx.Provider value={{ client: client ?? wsClient }}>
                            <RecoilRoot>
                                <React.Suspense fallback={<div>Loading...</div>}>
                                    <RegistriesCtxProvider
                                        actionRegistry={mockActions}
                                        componentRegistry={mockComponents}
                                    >
                                        <StoreProviders>
                                            <ServerVariableSyncProvider>
                                                <FallbackCtx.Provider value={{ suspend: true }}>
                                                    {child}
                                                </FallbackCtx.Provider>
                                            </ServerVariableSyncProvider>
                                        </StoreProviders>
                                    </RegistriesCtxProvider>
                                </React.Suspense>
                            </RecoilRoot>
                        </WebSocketCtx.Provider>
                    </ImportersCtx.Provider>
                </ThemeProvider>
            </QueryClientProvider>
        </ConfigContextProvider>
    );
};

function wrappedRender(ui: React.ReactElement, options?: RenderOptions): RenderResult {
    return render(ui, { wrapper: Wrapper as ComponentType, ...options });
}

export default wrappedRender;
