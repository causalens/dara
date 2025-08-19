import { waitFor } from '@testing-library/dom';
import { firstValueFrom } from 'rxjs';
import WS from 'vitest-websocket-mock';

import { WebSocketClient } from '@/api';

/**
 * Helper function to convert a json message to a string for the server to send
 *
 * @param type - the message type
 * @param message - the message to send
 * @returns the message as a string
 */
function toMsg(type: string, message: any): string {
    return JSON.stringify({ type, message });
}

async function initialize(liveReload = false): Promise<[server: WS, client: WebSocketClient]> {
    const server = new WS('ws://localhost:1234');
    const client = new WebSocketClient('ws://localhost:1234', 'test', liveReload);

    await server.connected;
    server.send(toMsg('init', { channel: 'test' }));

    return [server, client];
}

describe('WebsocketClient', () => {
    afterEach(() => {
        WS.clean();
    });

    it('should initialize the websocket connection when the client is instantiated', async () => {
        const client = (await initialize())[1];

        expect(await client.channel).toEqual('test');
    });

    it('should push messages received onto the messages stream', async () => {
        const [server, client] = await initialize();

        // Wait for the client to connect fully
        await client.channel;

        // Setup a listener for the messages stream
        const message = firstValueFrom(client.messages$);

        // Send a message to the client
        server.send(toMsg('custom', { message: 'test' }));

        // Check that the message was received
        expect(await message).toEqual({ type: 'custom', message: { message: 'test' } });
    });

    it('should allow the client to send messages to the server', async () => {
        const [server, client] = await initialize();

        // Wait for the client to connect fully
        await client.channel;

        client.sendMessage({ message: 'test' }, 'channel');

        // Check that the message was received
        await expect(server).toReceiveMessage(
            '{"channel":"channel","chunk_count":null,"message":{"message":"test"},"type":"message"}'
        );
    });

    it('should allow the client to send custom messages to the server', async () => {
        const [server, client] = await initialize();

        // Wait for the client to connect fully
        await client.channel;

        client.sendCustomMessage('test_custom', { message: 'test' });

        // Check that the message was received
        await expect(server).toReceiveMessage(
            '{"message":{"data":{"message":"test"},"kind":"test_custom"},"type":"custom"}'
        );
    });

    it('should allow the client to send custom messages to the server and receive responses', async () => {
        const [server, client] = await initialize();

        // Wait for the client to connect fully
        await client.channel;

        const result = client.sendCustomMessage('test_custom', { message: 'test' }, true);

        // Check that the message was received with an __rchan
        const receivedMessage = JSON.parse((await server.nextMessage) as string);
        expect(receivedMessage).toEqual({
            message: { data: { message: 'test' }, kind: 'test_custom', __rchan: expect.any(String) },
            type: 'custom',
        });

        // Send a response to the client
        server.send(
            toMsg('custom', {
                kind: 'test_custom',
                __response_for: receivedMessage.message.__rchan,
                data: { foo: 'bar' },
            })
        );

        const response = await result;
        expect(response).toEqual({
            message: { data: { foo: 'bar' }, __response_for: receivedMessage.message.__rchan, kind: 'test_custom' },
            type: 'custom',
        });
    });

    it('should attempt to reconnect to the websocket server if the connection is closed from the server side', async () => {
        const [server, client] = await initialize();

        // Wait for the client to connect fully
        await client.channel;

        const initializeSpy = vi.spyOn(client, 'initialize');

        // Close the server connection and then create new one
        server.close();
        const serverNew = new WS('ws://localhost:1234');

        await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1));

        // Wait for the client to reconnect
        await serverNew.connected;
        serverNew.send(toMsg('init', { channel: 'test_1' }));

        // Check that the client has reconnected
        expect(await client.channel).toEqual('test_1');

        const messagePromise = serverNew.nextMessage;

        // Check that we can still send messages
        client.sendMessage({ message: 'test' }, 'channel');

        // Check that the message was received
        expect(await messagePromise).toEqual(
            '{"channel":"channel","chunk_count":null,"message":{"message":"test"},"type":"message"}'
        );
    }, 10_000);

    it('should attempt to reconnect to the server multiple times if the initial one fails', async () => {
        const [server, client] = await initialize();

        // Wait for the client to connect fully
        await client.channel;

        const initializeSpy = vi.spyOn(client, 'initialize');

        // Close the server connection
        server.close();

        // Wait for the reconnect attempts to hit 2
        await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1));
        initializeSpy.mockClear();
        await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1));
        initializeSpy.mockClear();

        // The create a new server
        const serverNew = new WS('ws://localhost:1234');

        // Wait for the client to reconnect again and then respond
        await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1));

        // Wait for the client to reconnect
        await serverNew.connected;
        serverNew.send(toMsg('init', { channel: 'test_1' }));

        // Check that the client has reconnected
        expect(await client.channel).toEqual('test_1');
    });

    it('should stop retrying after max attempts has been reached', async () => {
        const [server, client] = await initialize();

        // Set the max attempts to 1 so it will retry once then fail
        client.maxAttempts = 1;

        // Wait for the client to connect fully
        await client.channel;

        const initializeSpy = vi.spyOn(client, 'initialize');

        // Close the server connection
        server.close();

        // Wait for the reconnect attempts to hit 2
        await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1));
        initializeSpy.mockClear();
        await waitFor(() => client.maxAttemptsReached);
    });

    it('should start retrying again when the dom visibility changes', async () => {
        const [server, client] = await initialize();

        // Set the max attempts to 1 so it will retry once then fail
        client.maxAttempts = 1;

        // Wait for the client to connect fully
        await client.channel;

        const initializeSpy = vi.spyOn(client, 'initialize');

        // Close the server connection
        server.close();

        // Wait for the reconnect attempts to hit 2
        await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1));
        initializeSpy.mockClear();

        // wait until the client has reached the max attempts
        await waitFor(() => client.maxAttemptsReached);

        // Create a new server to connect to
        const serverNew = new WS('ws://localhost:1234');

        // Trigger the visibility change event
        document.dispatchEvent(new Event('visibilitychange'));

        // Wait for the client to reconnect
        await serverNew.connected;
        serverNew.send(toMsg('init', { channel: 'test_1' }));

        // Check that the client has reconnected
        expect(await client.channel).toEqual('test_1');
    }, 10_000);

    it('should reload the window on reconnect when liveReload is true', async () => {
        // Configure mock of window location
        const original = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { reload: vi.fn() },
        });

        // Initialize the client with live reload enabled and wait for the channel to be set
        const [server, client] = await initialize(true);
        expect(await client.channel).toEqual('test');

        // Verify that we have not reloaded the window on first load
        expect(window.location.reload).toHaveBeenCalledTimes(0);

        const initializeSpy = vi.spyOn(client, 'initialize');

        // Close the server connection and then reconnect
        server.close();
        const serverNew = new WS('ws://localhost:1234');
        await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1));
        await serverNew.connected;
        serverNew.send(toMsg('init', { channel: 'test_1' }));

        // Check that the client has reconnected correctly
        expect(await client.channel).toEqual('test_1');

        // Verify that we have reloaded the window on reconnect
        expect(window.location.reload).toHaveBeenCalledTimes(1);

        // Tear down mock of window location
        Object.defineProperty(window, 'location', { configurable: true, value: original });
    });
});
