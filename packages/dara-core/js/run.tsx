import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NProgress from 'nprogress';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { RecoilRoot, useRecoilSnapshot } from 'recoil';

import { ThemeProvider } from '@darajs/styled-components';
import { ErrorBoundary } from '@darajs/ui-components';
import { useLatestRef } from '@darajs/ui-utils';

import { ConfigContextProvider, GlobalTaskProvider } from '@/shared/context';

import type { WebSocketClientInterface } from './api';
import './index.css';
import { DirectionCtx, ImportersCtx, resolveTheme } from './shared';
import { preloadAuthComponent } from './shared/dynamic-component/dynamic-auth-component';
import { preloadComponents } from './shared/dynamic-component/dynamic-component';
import { preloadActions } from './shared/interactivity/use-action';
import { createRouter } from './shared/router';
import type { DaraData } from './types';

declare global {
    interface Window {
        dara: DaraGlobals;
    }
}

interface DaraGlobals {
    base_url: string;
    ws?: WebSocketClientInterface;
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

    // TODO: This can error in scenarios where an asset is missing, how does this look like for the user?
    await Promise.all([
        // preload auth components to prevent flashing of extra spinners
        ...Object.values(daraData.auth_components).map((component) => preloadAuthComponent(importers, component)),
        // preload components for the entire loaded registry
        preloadComponents(importers, Object.values(daraData.components)),
        // preload actions
        preloadActions(importers, Object.values(daraData.actions)),
    ]);

    function RouterRoot(): JSX.Element {
        const snapshot = useRecoilSnapshot();
        const snapshotRef = useLatestRef(snapshot);

        const [router] = useState(() => createRouter(daraData, queryClient, snapshotRef));

        return <RouterProvider router={router} />;
    }

    const theme = resolveTheme(daraData.theme?.main, daraData.theme?.base);

    function Root(): JSX.Element {
        return (
            <ConfigContextProvider initialConfig={daraData}>
                <QueryClientProvider client={queryClient}>
                    <ThemeProvider theme={theme}>
                        <ErrorBoundary>
                            <ImportersCtx.Provider value={importers}>
                                <DirectionCtx.Provider value={{ direction: 'row' }}>
                                    <RecoilRoot>
                                        <GlobalTaskProvider>
                                            <RouterRoot />
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

    const container = document.getElementById('dara_root')!;
    const root = createRoot(container);
    root.render(<Root />);
}

export default run;
