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

// Use an in-memory BroadcastChannel polyfill for tests to avoid cross-worker
// traffic (which can leak session-state between Vitest workers), while still
// supporting libs like msw that require BroadcastChannel to exist.
class InMemoryBroadcastChannel extends EventTarget {
    private static channels = new Map<string, Set<InMemoryBroadcastChannel>>();

    readonly name: string;

    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

    constructor(name: string) {
        super();
        this.name = name;

        const peers = InMemoryBroadcastChannel.channels.get(name) ?? new Set<InMemoryBroadcastChannel>();
        peers.add(this);
        InMemoryBroadcastChannel.channels.set(name, peers);
    }

    postMessage(message: unknown): void {
        const peers = InMemoryBroadcastChannel.channels.get(this.name);
        if (!peers) {
            return;
        }

        for (const peer of peers) {
            if (peer === this) {
                continue;
            }
            peer.dispatchMessage(message);
        }
    }

    close(): void {
        const peers = InMemoryBroadcastChannel.channels.get(this.name);
        if (!peers) {
            return;
        }

        peers.delete(this);
        if (peers.size === 0) {
            InMemoryBroadcastChannel.channels.delete(this.name);
        }
    }

    private dispatchMessage(message: unknown): void {
        const event = new MessageEvent('message', { data: message });
        this.onmessage?.(event);
        this.dispatchEvent(event);
    }
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    writable: true,
    value: InMemoryBroadcastChannel,
});

// jsdom does not currently expose navigator.locks, provide a deterministic test polyfill.
if (!navigator.locks) {
    const lockTails = new Map<string, Promise<void>>();

    const lockManager = {
        async request<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
            const previousTail = lockTails.get(name) ?? Promise.resolve();
            let release!: () => void;
            const nextTail = new Promise<void>((resolve) => {
                release = resolve;
            });
            lockTails.set(
                name,
                previousTail.then(() => nextTail)
            );

            await previousTail;

            try {
                return await callback();
            } finally {
                release();
                if (lockTails.get(name) === nextTail) {
                    lockTails.delete(name);
                }
            }
        },
    };

    Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: lockManager,
    });
}
