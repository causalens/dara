import { waitFor } from '@testing-library/dom';
import { act } from '@testing-library/react';
import * as React from 'react';

import { setSessionToken } from '@/auth/use-session-token';
import globalStore from '@/shared/global-state-store';
import { getSessionKey } from '@/shared/interactivity/persistence';

import { DARA_JWT_TOKEN, TemplateRoot } from '../../js/shared';
import { MockWebSocketClient, server, wrappedRender } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

mockLocalStorage();

describe('TemplateRoot', () => {
    beforeEach(() => {
        server.listen();
        localStorage.clear();
        jest.restoreAllMocks();
        setSessionToken('TEST_TOKEN');
    });
    afterEach(() => {
        server.resetHandlers();
        act(() => {
            setSessionToken(null);
        });
    });
    afterAll(() => server.close());

    it('should render the template root component and expose the templateCtx', async () => {
        const { getByText } = wrappedRender(<TemplateRoot />);
        await waitFor(() => expect(getByText('Frame, Menu')).not.toBe(null));
        expect(getByText('Frame, Menu')).toBeInstanceOf(HTMLSpanElement);
    });

    it('should clean up cache on startup', async () => {
        // get session key while an invalid token is active
        setSessionToken('SOME_OTHER_SESSION_KEY');
        const invalidKey = getSessionKey('test-uid-1');
        // reset it back
        setSessionToken('TEST_TOKEN');
        const validKey = getSessionKey('test-uid-2');

        localStorage.setItem(invalidKey, 'val1');
        localStorage.setItem(validKey, 'val2');
        sessionStorage.setItem(invalidKey, 'val3');
        sessionStorage.setItem(validKey, 'val4');

        expect(localStorage.getItem(invalidKey)).toEqual('val1');
        expect(localStorage.getItem(validKey)).toEqual('val2');
        expect(sessionStorage.getItem(invalidKey)).toEqual('val3');
        expect(sessionStorage.getItem(validKey)).toEqual('val4');

        wrappedRender(<TemplateRoot />);

        // Other session value should be cleaned up
        await waitFor(() => {
            expect(localStorage.getItem(invalidKey)).toEqual(undefined);
            expect(localStorage.getItem(validKey)).toEqual('val2');
            expect(sessionStorage.getItem(invalidKey)).toEqual(undefined);
            expect(sessionStorage.getItem(validKey)).toEqual('val4');
        });
    });

    it('should subscribe to changes in the websocket token and trigger an update in the client', async () => {
        const wsClient = new MockWebSocketClient('uid');
        const updateTokenSpy = jest.spyOn(wsClient, 'updateToken');

        const { getByText } = wrappedRender(<TemplateRoot initialWebsocketClient={wsClient as any} />);
        // Wait for the page to be rendered
        await waitFor(() => expect(getByText('Frame, Menu')).not.toBe(null));

        // Update the token in the global store
        act(() => {
            globalStore.setValue(DARA_JWT_TOKEN, 'new_token');
        });

        expect(updateTokenSpy).toHaveBeenCalledWith('new_token');
    });
});
