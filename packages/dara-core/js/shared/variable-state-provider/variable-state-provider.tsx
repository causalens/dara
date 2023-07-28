import { useEffect } from 'react';

import { WebSocketClientInterface } from '@/api';
import { useVariableState } from '@/shared/interactivity';

interface VariableStateProviderProps {
    wsClient: WebSocketClientInterface;
}

/**
 * Responds to server variable value requests
 */
function VariableStateProvider(props: VariableStateProviderProps): JSX.Element {
    const getVariableState = useVariableState();

    useEffect(() => {
        const sub = props.wsClient?.variableRequests$().subscribe((req) => {
            const variableValue = getVariableState(req.message.variable);
            props.wsClient.sendVariable(variableValue, req.message.__rchan);
        });

        return () => {
            sub?.unsubscribe();
        };
    }, [props.wsClient, getVariableState]);

    return null;
}

export default VariableStateProvider;
