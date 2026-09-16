/* eslint-disable @typescript-eslint/no-unused-vars */

/* eslint-disable react/no-unused-prop-types */

/* eslint-disable import/no-extraneous-dependencies */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, type RenderResult, render } from '@testing-library/react';
import React, { type ComponentType, type ReactElement, type ReactNode, useRef } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { RecoilRoot } from 'recoil';
import { RecoilURLSync } from 'recoil-sync';

import { ThemeProvider, theme } from '@darajs/styled-components';

import { PathParamSync, StoreProviders } from '@/shared/interactivity/persistence';
import { usePollScope } from '@/shared/interactivity/polling';
import { type Deferred, deferred, useUrlSync } from '@/shared/utils';

import { NavigateTo, ResetVariables, TriggerVariable, UpdateVariable } from '../../../js/actions';
import { type WebSocketClientInterface } from '../../../js/api/websocket';
import { ServerVariableSyncProvider } from '../../../js/shared';
import {
    ConfigContextProvider,
    FallbackCtx,
    GlobalTaskProvider,
    VariableCtx,
    WebSocketCtx,
} from '../../../js/shared/context';
import { type Component, type ComponentInstance, type DaraData, type ModuleContent } from '../../../js/types';
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

// Direct implementations mirror the generated entry without dynamic module loaders.
export const componentImplementations = {
    TemplateRoot,
    TestComponent: 'div' as any,
    TestPropsComponent: (props: any) => <div>{JSON.stringify(props)}</div>,
};
export const actionImplementations = {
    NavigateTo,
    ResetVariables,
    TriggerVariable,
    UpdateVariable,
};

export const wsClient = new MockWebSocketClient('uid');

interface WrapperProps {
    componentsRegistry?: Record<string, Component>;
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
    ws: Deferred<WebSocketClientInterface>;
}

export const daraData: DaraData = {
    build_dev: false,
    auth_components: {
        login: {
            js_source: '@darajs/core/auth/default/default-auth-login',
            py_module: 'dara_core',
        },
        logout: {
            js_source: '@darajs/core/auth/basic/basic-auth-logout',
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
        default_path: null,
        route_matches: {
            __typename: 'Variable',
            default: [],
            nested: [],
            uid: 'route-matches',
        },
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
    const pollScope = usePollScope();

    let child = children;

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
                <VariableCtx.Provider value={{ pollScope, variables }}>{child}</VariableCtx.Provider>
            </GlobalTaskProvider>
        );
    }

    if (!window.dara) {
        window.dara = {
            base_url: '',
            ws: deferred(),
        };
    }
    if (window.dara.ws?.status === 'pending') {
        window.dara.ws.resolve(wsClient);
    }

    return (
        <ConfigContextProvider
            initialConfig={{
                build_dev: false,
                auth_components: {
                    login: {
                        js_source: '@darajs/core/auth/default/default-auth-login',
                        py_module: 'dara_core',
                    },
                    logout: {
                        js_source: '@darajs/core/auth/basic/basic-auth-logout',
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
                    default_path: null,
                    route_matches: {
                        __typename: 'Variable',
                        default: [],
                        nested: [],
                        uid: 'route-matches',
                    },
                },
                theme: { base: 'dark', main: 'dark' },
                title: 'Test App',
            }}
        >
            <QueryClientProvider client={queryClient}>
                <ThemeProvider theme={theme}>
                    <WebSocketCtx.Provider value={{ client: client ?? wsClient }}>
                        <RecoilRoot>
                            <React.Suspense fallback={<div>Loading...</div>}>
                                <StoreProviders>
                                    <ServerVariableSyncProvider>
                                        <FallbackCtx.Provider value={{ suspend: true }}>{child}</FallbackCtx.Provider>
                                    </ServerVariableSyncProvider>
                                </StoreProviders>
                            </React.Suspense>
                        </RecoilRoot>
                    </WebSocketCtx.Provider>
                </ThemeProvider>
            </QueryClientProvider>
        </ConfigContextProvider>
    );
};

function wrappedRender(ui: React.ReactElement, options?: RenderOptions): RenderResult {
    return render(ui, { wrapper: Wrapper as ComponentType, ...options });
}

export default wrappedRender;
