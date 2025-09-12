import { useEffect, useLayoutEffect, useState } from 'react';
import { Outlet, redirect, useNavigate } from 'react-router';

import styled from '@darajs/styled-components';
import { NotificationWrapper } from '@darajs/ui-notifications';

import { WebSocketClient, type WebSocketClientInterface, setupWebsocket } from '@/api';
import { resolveReferrer } from '@/auth';
import { getSessionToken, onTokenChange, useSessionToken } from '@/auth/use-session-token';
import { DevTools } from '@/devtools';
import { WebSocketCtx } from '@/shared/context';
import { cleanSessionCache } from '@/shared/utils';
import VariableStateProvider from '@/shared/variable-state-provider/variable-state-provider';
import type { DaraData } from '@/types/core';

import { RegistriesCtxProvider } from '../context/registries-context';
import { ServerVariableSyncProvider } from '../interactivity';
import { StoreProviders } from '../interactivity/persistence';
import DynamicContext from './dynamic-context';

const RootWrapper = styled.div`
    scrollbar-color: ${(props) => `${props.theme.colors.grey5} ${props.theme.colors.grey2}`};

    /* Works on Firefox */
    scrollbar-width: thin;

    display: flex;
    flex: 1;

    width: 100%;
    height: 100%;

    color: ${(props) => props.theme.colors.text};

    /* Works on Chrome, Edge and Safari */
    *::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }

    *::-webkit-scrollbar-track {
        background: ${(props) => props.theme.colors.grey2};
        border-radius: 100px;
    }

    *::-webkit-scrollbar-corner {
        background: ${(props) => props.theme.colors.grey2};
    }

    *::-webkit-scrollbar-thumb {
        background-color: ${(props) => props.theme.colors.grey5};
        border-radius: 100px;
    }
`;

/**
 * Create a loader function for the authenticated root.
 * This will ensure the WS client is set up at the time of running all loaders,
 * which is required as other loaders will need to access the WS client.
 */
export function createAuthenticatedRootLoader(daraData: DaraData) {
    return function loader() {
        // ensure ws client is set up
        if (window.dara.ws.status === 'pending') {
            const token = getSessionToken();
            if (!token) {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw redirect('/login');
            }
            window.dara.ws.resolve(setupWebsocket(token, daraData.live_reload));
        }
    };
}

interface AuthenticatedRootProps {
    daraData: DaraData;
    // An initialWebsocketClient, only used for testing
    initialWebsocketClient?: WebSocketClient;
}

/**
 * The TemplateRoot component is rendered at the root of every authenticated application */
function AuthenticatedRoot(props: AuthenticatedRootProps): React.ReactNode {
    const navigate = useNavigate();
    const token = useSessionToken()!;

    const [wsClient] = useState(() => {
        if (props.initialWebsocketClient) {
            return props.initialWebsocketClient;
        }
        return window.dara.ws.getOrThrow();
    });

    useLayoutEffect(() => {
        if (token) {
            cleanSessionCache(token);
        } else {
            // if for some reason we don't have a token, redirect back to login
            navigate({ pathname: '/login', search: `?referrer=${resolveReferrer()}` });
        }
    }, [token, navigate]);

    useEffect(() => {
        // subscribe to token changes and notify the live WS connection
        return onTokenChange((newToken) => {
            // it only changes to null if we're logging out
            if (newToken) {
                wsClient.updateToken(newToken);
            }
        });
    }, [wsClient]);

    return (
        <WebSocketCtx.Provider value={{ client: wsClient }}>
            <RegistriesCtxProvider
                componentRegistry={props.daraData.components}
                actionRegistry={props.daraData.actions}
            >
                <DynamicContext contextComponents={props.daraData.context_components}>
                    <StoreProviders>
                        <ServerVariableSyncProvider>
                            <RootWrapper>
                                <NotificationWrapper />
                                <Outlet />
                                <VariableStateProvider wsClient={wsClient} />
                                {props.daraData.enable_devtools && <DevTools />}
                            </RootWrapper>
                        </ServerVariableSyncProvider>
                    </StoreProviders>
                </DynamicContext>
            </RegistriesCtxProvider>
        </WebSocketCtx.Provider>
    );
}

export default AuthenticatedRoot;
