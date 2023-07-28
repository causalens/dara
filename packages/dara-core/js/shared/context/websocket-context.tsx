import { createContext } from 'react';

import { WebSocketClientInterface } from '@/api/websocket';

interface WebsocketCtx {
    client?: WebSocketClientInterface;
}

const websocketCtx = createContext<WebsocketCtx>({});

export default websocketCtx;
