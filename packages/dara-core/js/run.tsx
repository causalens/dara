import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NProgress from 'nprogress';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';

import { ErrorBoundary } from '@darajs/ui-components';

import type { WebSocketClientInterface } from './api';
import './index.css';
import RouterRoot from './router/router-root';
import { type Deferred, DirectionCtx, deferred } from './shared';
import { ConfigContextProvider, GlobalTaskProvider } from './shared/context';
import { registerAuthComponents } from './shared/dynamic-component/dynamic-auth-component';
import { registerComponents } from './shared/dynamic-component/dynamic-component';
import { registerActions } from './shared/interactivity/use-action';
import type { ActionHandler, DaraData } from './types';

declare global {
    interface Window {
        dara: DaraGlobals;
    }
}

interface DaraGlobals {
    base_url: string;
    ws: Deferred<WebSocketClientInterface>;
}

export function Root(props: { daraData: DaraData; queryClient: QueryClient }): JSX.Element {
    return (
        <ConfigContextProvider initialConfig={props.daraData}>
            <QueryClientProvider client={props.queryClient}>
                <ErrorBoundary>
                    <DirectionCtx.Provider value={{ direction: 'row' }}>
                        <RecoilRoot>
                            <GlobalTaskProvider>
                                <RouterRoot daraData={props.daraData} />
                            </GlobalTaskProvider>
                        </RecoilRoot>
                    </DirectionCtx.Provider>
                </ErrorBoundary>
            </QueryClientProvider>
        </ConfigContextProvider>
    );
}

/** The single runtime entry contract shared by development and production builds. */
export interface Implementations {
    components: Record<string, ComponentType<any>>;
    actions: Record<string, ActionHandler<any>>;
    auth: Record<string, ComponentType>;
}

/** Bootstrap the app from statically imported implementations and Python's runtime data. */
function run(implementations: Implementations): void {
    const queryClient = new QueryClient();

    const daraData: DaraData = JSON.parse(document.getElementById('__DARA_DATA__')!.textContent ?? '{}');

    document.title = daraData.title;
    NProgress.configure({ showSpinner: false });

    // ensure we have a deferred WS client
    window.dara.ws = deferred();

    registerAuthComponents(implementations.auth);
    registerComponents(implementations.components);
    registerActions(implementations.actions);

    const container = document.getElementById('dara_root')!;
    const root = createRoot(container);
    root.render(<Root daraData={daraData} queryClient={queryClient} />);
}

export default run;
