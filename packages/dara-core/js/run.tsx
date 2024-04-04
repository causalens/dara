import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserHistory } from 'history';
import { createRoot } from 'react-dom/client';
import { Router } from 'react-router-dom';
import { RecoilRoot } from 'recoil';
import { RecoilURLSync } from 'recoil-sync';

import { ThemeProvider, theme } from '@darajs/styled-components';
import { ErrorBoundary } from '@darajs/ui-components';
import { NotificationWrapper } from '@darajs/ui-notifications';

import { useUrlSync } from '@/shared/utils';

import AuthWrapper from './auth/auth-wrapper';
import './index.css';
import { DirectionCtx, ImportersCtx, TemplateRoot } from './shared';

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
function run(
    importers: {
        [k: string]: () => Promise<any>;
    },
    baseUrl?: string
): void {
    const queryClient = new QueryClient();

    window.dara = {
        ...window.dara,
        base_url: baseUrl ?? '',
    };

    let basename = '';

    if (window.dara.base_url !== '') {
        basename = new URL(window.dara.base_url, window.origin).pathname;
    }

    function Root(): JSX.Element {
        const history = createBrowserHistory({ basename });
        const syncOptions = useUrlSync({ history });

        return (
            <QueryClientProvider client={queryClient}>
                <ThemeProvider theme={theme}>
                    <ErrorBoundary>
                        <ImportersCtx.Provider value={importers}>
                            <DirectionCtx.Provider value={{ direction: 'row' }}>
                                <RecoilRoot>
                                    <RecoilURLSync {...syncOptions}>
                                        <Router history={history}>
                                            <AuthWrapper>
                                                <NotificationWrapper />
                                                <TemplateRoot />
                                            </AuthWrapper>
                                        </Router>
                                    </RecoilURLSync>
                                </RecoilRoot>
                            </DirectionCtx.Provider>
                        </ImportersCtx.Provider>
                    </ErrorBoundary>
                </ThemeProvider>
            </QueryClientProvider>
        );
    }

    const container = document.getElementById('dara_root');
    const root = createRoot(container);
    root.render(<Root />);
}

export default run;
