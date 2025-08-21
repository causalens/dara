/* eslint-disable import/no-extraneous-dependencies */
// eslint-disable-next-line import/no-extraneous-dependencies
import '@testing-library/jest-dom/vitest';
import * as React from 'react';
import { RecoilEnv } from 'recoil';
// @ts-expect-error typescript is not happy but this works
import { fetch as fetchPolyfill } from 'whatwg-fetch';

// Make React available globally for tests (required for classic JSX runtime)
global.React = React;

// disable duplicate atom key checking in tests, as we clear the registries between tests
// but recoil does not provide a way to clear the atoms in their internals, so the warnings are false positives
RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = false;

// explicitly polyfill fetch

// Override global fetch to always include credentials
// This simplifies the tests as we don't have to pass credentials: 'include' to every request
// In reality in a browser we're always dealing with same-origin in Dara so this is fine
global.fetch = (input, info?) => {
    const init = info || {};
    init.credentials = 'include';
    return fetchPolyfill(input, init);
};

// Simulate Jest for waitFor()
// see https://github.com/testing-library/dom-testing-library/blob/0ce0c7054dfa64d1cd65053790246aed151bda9d/src/helpers.ts#L5
// and https://github.com/testing-library/dom-testing-library/blob/0ce0c7054dfa64d1cd65053790246aed151bda9d/src/wait-for.js#L53
global.jest = {
    // @ts-expect-error vi is globally available
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
} as any;
