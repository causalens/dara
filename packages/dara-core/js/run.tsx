import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { ThemeProvider } from '@darajs/styled-components';
import { ErrorBoundary } from '@darajs/ui-components';

import { ConfigContextProvider } from '@/shared/context';

import './index.css';
import { DirectionCtx, ImportersCtx, resolveTheme } from './shared';
import { createRouter } from './shared/router';
import type { DaraData } from './types';

declare global {
    interface Window {
        dara: DaraGlobals;
    }
}

interface DaraGlobals {
    base_url: string;
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
    console.log(daraData);
    const router = await createRouter(daraData, importers);

    const theme = resolveTheme(daraData.theme?.main, daraData.theme?.base);
    function Root(): JSX.Element {
        return (
            <ConfigContextProvider initialConfig={daraData}>
                <QueryClientProvider client={queryClient}>
                    <ThemeProvider theme={theme}>
                        <ErrorBoundary>
                            <ImportersCtx.Provider value={importers}>
                                <DirectionCtx.Provider value={{ direction: 'row' }}>
                                    <RouterProvider router={router} />
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
