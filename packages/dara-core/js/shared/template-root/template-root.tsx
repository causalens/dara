/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';

import styled, { ThemeProvider } from '@darajs/styled-components';

import { WebSocketClient, setupWebsocket, useActions, useComponents, useConfig, useTemplate } from '@/api';
import { onTokenChange, useSessionToken } from '@/auth/use-session-token';
import { DevTools } from '@/devtools';
import { GlobalTaskProvider, RegistriesCtx, WebSocketCtx } from '@/shared/context';
import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import { cleanSessionCache, resolveTheme } from '@/shared/utils';
import VariableStateProvider from '@/shared/variable-state-provider/variable-state-provider';

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
 * The TemplateRoot component is rendered at the root of every application and is responsible for loading the config and
 * template for the application. It provides the Template context down to it's children and also renders the root
 * component of the template
 */
function TemplateRoot(): JSX.Element {
    const token = useSessionToken();
    const { data: config } = useConfig();
    const { data: template, isLoading: templateLoading } = useTemplate(config?.template);

    const { data: actions, isLoading: actionsLoading } = useActions();
    const { data: components, isLoading: componentsLoading, refetch: refetchComponents } = useComponents();
    const [wsClient, setWsClient] = useState<WebSocketClient>();

    useEffect(() => {
        cleanSessionCache(token);
    }, [token]);

    useEffect(() => {
        if (!wsClient) {
            return;
        }

        // subscribe to token changes and notify the live WS connection
        return onTokenChange((newToken) => {
            wsClient.updateToken(newToken);
        });
    }, [wsClient]);

    useEffect(() => {
        if (config?.title) {
            document.title = config.title;
        }
    }, [config?.title]);

    useEffect(() => {
        if (config) {
            setWsClient(setupWebsocket(token, config.live_reload));
        }

        return () => {
            wsClient?.close();
        };
    }, [token, config?.live_reload]);

    if (templateLoading || actionsLoading || componentsLoading) {
        return null;
    }

    return (
        <ThemeProvider theme={resolveTheme(config?.theme?.main, config?.theme?.base)}>
            <WebSocketCtx.Provider value={{ client: wsClient }}>
                <RegistriesCtx.Provider
                    value={{ actionRegistry: actions, componentRegistry: components, refetchComponents }}
                >
                    <GlobalTaskProvider>
                        <DynamicContext contextComponents={config?.context_components ?? []}>
                            <StoreProviders>
                                <RootWrapper>
                                    <DynamicComponent component={template?.layout} />
                                    <VariableStateProvider wsClient={wsClient} />
                                    {config?.enable_devtools && <DevTools />}
                                </RootWrapper>
                            </StoreProviders>
                        </DynamicContext>
                    </GlobalTaskProvider>
                </RegistriesCtx.Provider>
            </WebSocketCtx.Provider>
        </ThemeProvider>
    );
}

export default TemplateRoot;
