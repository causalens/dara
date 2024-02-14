import { waitFor } from '@testing-library/dom';
import React from 'react';

import { getSessionKey } from '@/shared/interactivity/persistence';

import { TemplateRoot } from '../../js/shared';
import { server, wrappedRender } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

mockLocalStorage();

describe('TemplateRoot', () => {
    beforeEach(() => {
        server.listen();
        localStorage.clear();
        jest.restoreAllMocks();
    });
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    it('should render nothing until the component has loaded', async () => {
        const { container } = wrappedRender(<TemplateRoot />);

        await waitFor(() => {
            expect(container.firstChild.firstChild).toBe(null);
        });
    });

    it('should render the template root component and expose the templateCtx', async () => {
        const { getByText } = wrappedRender(<TemplateRoot />);
        await waitFor(() => expect(getByText('Frame, Menu')).not.toBe(null));
        expect(getByText('Frame, Menu')).toBeInstanceOf(HTMLSpanElement);
    });

    it('should clean up cache on startup', async () => {
        const invalidKey = getSessionKey('SOME_OTHER_SESSION_KEY', 'test-uid-1');
        const validKey = getSessionKey('TEST_TOKEN', 'test-uid-2');

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
});
