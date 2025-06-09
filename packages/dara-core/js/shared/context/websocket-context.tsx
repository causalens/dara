import { createContext } from 'react';

import { type WebSocketClientInterface } from '@/api/websocket';

interface WebsocketCtx {
    client: WebSocketClientInterface;
}

const websocketCtx = createContext<WebsocketCtx>({ client: undefined as any });

export default websocketCtx;
