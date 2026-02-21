import { waitFor } from '@testing-library/dom';
import { act } from '@testing-library/react';
import * as React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setSessionIdentifier } from '@/auth/session-state';
import { clearCaches_TEST } from '@/shared/dynamic-component/dynamic-component';
import { getSessionKey } from '@/shared/interactivity/persistence';

import { AuthenticatedRoot } from '../../js/shared';
import { server, wrappedRender } from './utils';
import { mockLocalStorage } from './utils/mock-storage';
import { daraData, wsClient } from './utils/wrapped-render';

mockLocalStorage();

describe('AuthenticatedRoot', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        clearCaches_TEST();
        localStorage.clear();
        vi.restoreAllMocks();
        setSessionIdentifier('TEST_TOKEN');
    });
    afterEach(() => {
        server.resetHandlers();
        act(() => {
            setSessionIdentifier(null);
        });
    });
    afterAll(() => server.close());

    it('should clean up cache on startup', async () => {
        // get session key while an invalid token is active
        setSessionIdentifier('SOME_OTHER_SESSION_KEY');
        const invalidKey = getSessionKey('test-uid-1');
        // reset it back
        setSessionIdentifier('TEST_TOKEN');
        const validKey = getSessionKey('test-uid-2');

        localStorage.setItem(invalidKey, 'val1');
        localStorage.setItem(validKey, 'val2');
        sessionStorage.setItem(invalidKey, 'val3');
        sessionStorage.setItem(validKey, 'val4');

        expect(localStorage.getItem(invalidKey)).toEqual('val1');
        expect(localStorage.getItem(validKey)).toEqual('val2');
        expect(sessionStorage.getItem(invalidKey)).toEqual('val3');
        expect(sessionStorage.getItem(validKey)).toEqual('val4');

        wrappedRender(<AuthenticatedRoot daraData={daraData} initialWebsocketClient={wsClient as any} />);

        // Other session value should be cleaned up
        await waitFor(() => {
            expect(localStorage.getItem(invalidKey)).toEqual(undefined);
            expect(localStorage.getItem(validKey)).toEqual('val2');
            expect(sessionStorage.getItem(invalidKey)).toEqual(undefined);
            expect(sessionStorage.getItem(validKey)).toEqual('val4');
        });
    });
});
