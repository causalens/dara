import { useEffect } from 'react';

import { type WebSocketClientInterface } from '@/api';
import { useVariableState } from '@/shared/interactivity';

interface VariableStateProviderProps {
    wsClient: WebSocketClientInterface;
}

/**
 * Responds to server variable value requests
 */
function VariableStateProvider(props: VariableStateProviderProps): React.ReactNode {
    const getVariableState = useVariableState();

    useEffect(() => {
        const sub = props.wsClient?.variableRequests$().subscribe(async (req) => {
            // Catch any errors when fetching the variable value otherwise this takes down the stream and no further
            // requests are processed.
            try {
                const variableValue = await getVariableState(req.message.variable);
                props.wsClient.sendVariable(variableValue, req.message.__rchan);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(`Error when processing a getVariableValue request: ${String(err)}`);
            }
        });

        return () => {
            sub?.unsubscribe();
        };
    }, [props.wsClient, getVariableState]);

    return null;
}

export default VariableStateProvider;
