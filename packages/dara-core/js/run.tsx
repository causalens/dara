import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NProgress from 'nprogress';
import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';

import { ThemeProvider } from '@darajs/styled-components';
import { ErrorBoundary } from '@darajs/ui-components';

import { ConfigContextProvider, GlobalTaskProvider } from '@/shared/context';

import type { WebSocketClientInterface } from './api';
import './index.css';
import RouterRoot from './router/router-root';
import { type Deferred, DirectionCtx, ImportersCtx, deferred, resolveTheme } from './shared';
import { preloadAuthComponent } from './shared/dynamic-component/dynamic-auth-component';
import { preloadComponents } from './shared/dynamic-component/dynamic-component';
import { preloadActions } from './shared/interactivity/use-action';
import type { DaraData } from './types';

declare global {
    interface Window {
        dara: DaraGlobals;
    }
}

interface DaraGlobals {
    base_url: string;
    ws: Deferred<WebSocketClientInterface>;
}

export function Root(props: {
    daraData: DaraData;
    queryClient: QueryClient;
    importers: { [k: string]: () => Promise<any> };
    theme: any;
}): JSX.Element {
    return (
        <ConfigContextProvider initialConfig={props.daraData}>
            <QueryClientProvider client={props.queryClient}>
                <ThemeProvider theme={props.theme}>
                    <ErrorBoundary>
                        <ImportersCtx.Provider value={props.importers}>
                            <DirectionCtx.Provider value={{ direction: 'row' }}>
                                <RecoilRoot>
                                    <GlobalTaskProvider>
                                        <RouterRoot daraData={props.daraData} />
                                    </GlobalTaskProvider>
                                </RecoilRoot>
                            </DirectionCtx.Provider>
                        </ImportersCtx.Provider>
                    </ErrorBoundary>
                </ThemeProvider>
            </QueryClientProvider>
        </ConfigContextProvider>
    );
}

/**
 * The main run function for the JS half of the application creates a div and binds the react app onto the tree. It sets
 * up a lot of context providers for the rest of the application. It accepts an object of importers as an argument. An
 * importer is a function that calls a dynamic import statement and allows arbitrary JS code to be loaded into the core
 * application code (DynamicComponent). This object needs to be defined in the client application.
 *
 * @param importers - the importers object.
 */
async function run(importers: { [k: string]: () => Promise<any> }): Promise<void> {
    const queryClient = new QueryClient();

    const daraData: DaraData = JSON.parse(document.getElementById('__DARA_DATA__')!.textContent!);

    document.title = daraData.title;
    NProgress.configure({ showSpinner: false });

    // ensure we have a deferred WS client
    window.dara.ws = deferred();

    await Promise.all([
        // preload auth components to prevent flashing of extra spinners
        ...Object.values(daraData.auth_components).map((component) => preloadAuthComponent(importers, component)),
        // preload components and actions for the entire loaded registry
        preloadComponents(importers, Object.values(daraData.components)),
        preloadActions(importers, Object.values(daraData.actions)),
    ]);

    const theme = resolveTheme(daraData.theme?.main, daraData.theme?.base);

    const container = document.getElementById('dara_root')!;
    const root = createRoot(container);
    root.render(<Root daraData={daraData} queryClient={queryClient} importers={importers} theme={theme} />);
}

export default run;
