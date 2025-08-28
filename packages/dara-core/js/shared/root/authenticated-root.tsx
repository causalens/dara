/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useLayoutEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';

import styled from '@darajs/styled-components';
import { NotificationWrapper } from '@darajs/ui-notifications';

import { WebSocketClient, setupWebsocket } from '@/api';
import { resolveReferrer } from '@/auth';
import { onTokenChange, useSessionToken } from '@/auth/use-session-token';
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

interface TemplateRootProps {
    daraData: DaraData;
    // An initialWebsocketClient, only used for testing
    initialWebsocketClient?: WebSocketClient;
}

/**
 * The TemplateRoot component is rendered at the root of every authenticated application */
function TemplateRoot(props: TemplateRootProps): React.ReactNode {
    const navigate = useNavigate();
    const token = useSessionToken()!;

    const [wsClient, setWsClient] = useState<WebSocketClient | undefined>(() => props.initialWebsocketClient);

    useLayoutEffect(() => {
        if (token) {
            cleanSessionCache(token);
        } else {
            // if for some reason we don't have a token, redirect back to login
            navigate({ pathname: '/login', search: `?referrer=${resolveReferrer()}` });
        }
    }, [token]);

    useEffect(() => {
        if (!wsClient) {
            return;
        }

        // subscribe to token changes and notify the live WS connection
        return onTokenChange((newToken) => {
            // it only changes to null if we're logging out
            if (newToken) {
                wsClient.updateToken(newToken);
            }
        });
    }, [wsClient]);

    useEffect(() => {
        // already set up - make sure we don't recreate connections,
        // we use updateToken explicitly to update a live connection
        if (wsClient) {
            return;
        }

        const newWsClient = setupWebsocket(token, props.daraData.live_reload);
        setWsClient(newWsClient);
    }, [token, props.daraData.live_reload]);

    if (!wsClient) {
        return null;
    }

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

export default TemplateRoot;
