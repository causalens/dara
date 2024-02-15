import { mixed } from '@recoiljs/refine';
import * as React from 'react';
import { AtomEffect } from 'recoil';
import { ListenToItems, ReadItem, RecoilSync, WriteItems, syncEffect } from 'recoil-sync';

import { validateResponse } from '@darajs/ui-utils';

import { handleAuthErrors } from '@/api';
import { RequestExtras, RequestExtrasSerializable, request } from '@/api/http';
import { SingleVariable } from '@/types';
import { BackendStore, PersistenceStore } from '@/types/core';

import { WebSocketCtx, useRequestExtras } from '../context';
import { isEmbedded } from '../utils/embed';

/**
 * Global map to store the extras for each store uid
 */
const STORE_EXTRAS_MAP = new Map<string, RequestExtrasSerializable>();

/**
 * RecoilSync implementation for BackendStore
 *
 * - read: GET from /api/core/store/:store_uid
 * - write: POST to /api/core/store
 * - listen: subscribed to `backendStoreMessages$` on WsClient
 */
function BackendStoreSync({ children }: { children: React.ReactNode }): JSX.Element {
    const { client } = React.useContext(WebSocketCtx);

    const getStoreValue = React.useCallback<ReadItem>(async (itemKey) => {
        const serializableExtras = STORE_EXTRAS_MAP.get(itemKey);
        const response = await request(`/api/core/store/${itemKey}`, {}, serializableExtras.extras);
        await handleAuthErrors(response, true);
        await validateResponse(response, `Failed to fetch the store value for key: ${itemKey}`);
        const val = await response.json();

        return val;
    }, []);

    const syncStoreValues = React.useCallback<WriteItems>(async ({ diff }) => {
        // keep track of extras -> diff to send each set of extras as a separate request
        const extrasMap = new Map<RequestExtrasSerializable, Record<string, any>>();

        for (const [itemKey, value] of diff.entries()) {
            const extras = STORE_EXTRAS_MAP.get(itemKey);

            if (!extrasMap.has(extras)) {
                extrasMap.set(extras, {});
            }

            // store the value in the extras map
            extrasMap.get(extras)[itemKey] = value;
        }

        async function sendRequest(
            serializableExtras: RequestExtrasSerializable,
            storeDiff: Record<string, any>
        ): Promise<void> {
            const response = await request(
                `/api/core/store`,
                { body: JSON.stringify(storeDiff), method: 'POST' },
                serializableExtras.extras
            );
            await handleAuthErrors(response, true);
            await validateResponse(response, `Failed to sync the store values`);
        }

        // Send a request with each different set of extras
        await Promise.allSettled(
            Array.from(extrasMap.entries()).map(([serializableExtras, storeDiff]) =>
                sendRequest(serializableExtras, storeDiff)
            )
        );
    }, []);

    const listenToStoreChanges = React.useCallback<ListenToItems>(
        ({ updateItem }) => {
            if (!client) {
                return;
            }

            const sub = client.backendStoreMessages$().subscribe((message) => {
                updateItem(message.store_uid, message.value);
            });

            return () => sub.unsubscribe();
        },
        [client]
    );

    return (
        <RecoilSync listen={listenToStoreChanges} read={getStoreValue} storeKey="BackendStore" write={syncStoreValues}>
            {children}
        </RecoilSync>
    );
}

/**
 * Create a syncEffect for BackendStore
 *
 * @param variable variable to create the atom effect for
 * @param requestExtras extras object to create the effect for; used to pass through correct extras to write requests
 */
function backendStoreEffect<T>(
    variable: SingleVariable<T, BackendStore>,
    requestExtras: RequestExtrasSerializable
): AtomEffect<any> {
    // Assumption: the set of extras is unique to the store, i.e. the variable will not be used under different sets of extras
    STORE_EXTRAS_MAP.set(variable.store.uid, requestExtras);
    return syncEffect({
        /** Use store uid as the unique identifier */
        itemKey: variable.store.uid,
        refine: mixed(),
        storeKey: 'BackendStore',
    });
}

/**
 * Get the session key used to persist a variable value
 *
 * @param extras request extras to be merged into the options
 * @param uid uid of the variable to persist
 */
export function getSessionKey(extras: RequestExtras, uid: string): string {
    const sessionToken = typeof extras === 'string' ? extras : extras.sessionToken;

    // If we're within an IFrame (Jupyter)
    if (isEmbedded()) {
        return `dara-session-${(window.frameElement as HTMLIFrameElement).dataset.daraPageId}-var-${uid}`;
    }

    return `dara-session-${sessionToken}-var-${uid}`;
}

/**
 * RecoilSync implementation for BrowserStore
 *
 * localStorage keys are generated via @see getSessionKey
 *
 * - read: read from localStorage
 * - write: write to localStorage
 * - listen: subscribe to 'storage' event for cross-tab or cross-window syncing
 */
function BrowserStoreSync({ children }: { children: React.ReactNode }): JSX.Element {
    const extras = useRequestExtras();

    const getStoreValue = React.useCallback<ReadItem>(
        (itemKey) => {
            const key = getSessionKey(extras, itemKey);
            return JSON.parse(localStorage.getItem(key) ?? 'null');
        },
        [extras]
    );

    const syncStoreValues = React.useCallback<WriteItems>(
        ({ diff }) => {
            for (const [itemKey, value] of diff.entries()) {
                const key = getSessionKey(extras, itemKey);
                localStorage.setItem(key, JSON.stringify(value));
            }
        },
        [extras]
    );

    /**
     * Listen to storage events and update the store when a change is detected.
     *
     * This is useful to keep the store in sync across tabs.
     */
    const listenToStoreChanges = React.useCallback<ListenToItems>(
        ({ updateItem }) => {
            const listener = (e: StorageEvent): void => {
                if (e.storageArea === localStorage) {
                    if (e.key) {
                        // check if the key matches our dara-session key
                        const match = e.key.match(/^dara-session-(.*)-var-(.*)$/);
                        if (match) {
                            const [, sessionToken, uid] = match;
                            if (
                                (typeof extras === 'string' && sessionToken === extras) ||
                                (typeof extras === 'object' && extras.sessionToken === sessionToken)
                            ) {
                                updateItem(uid, JSON.parse(e.newValue ?? 'null'));
                            }
                        }
                    }
                }
            };

            window.addEventListener('storage', listener);

            return () => {
                window.removeEventListener('storage', listener);
            };
        },
        [extras]
    );

    return (
        <RecoilSync listen={listenToStoreChanges} read={getStoreValue} storeKey="BrowserStore" write={syncStoreValues}>
            {children}
        </RecoilSync>
    );
}

/**
 * Create a syncEffect for BrowserStore
 *
 * @param variable variable to create effect for
 */
function localStorageEffect<T>(variable: SingleVariable<T, PersistenceStore>): AtomEffect<any> {
    let firstRun = false;

    return syncEffect({
        itemKey: variable.uid,
        read: ({ read }) => {
            const readValue = read(variable.uid);

            if (!firstRun) {
                firstRun = true;

                // during first run fall back to the default value if the read value is null
                // as localstorage might not have been initialized yet
                if (!readValue) {
                    return variable.default;
                }
            }

            return readValue;
        },
        refine: mixed(),
        storeKey: 'BrowserStore',
    });
}

interface StoreSync {
    (props: { children: React.ReactNode }): JSX.Element;
}

interface Effect<T = any> {
    (variable: SingleVariable<T>, requestExtras: RequestExtrasSerializable): AtomEffect<T>;
}

export const STORES: Record<
    string,
    {
        effect: Effect;
        sync: StoreSync;
    }
> = {
    BackendStore: {
        effect: backendStoreEffect,
        sync: BackendStoreSync,
    },
    BrowserStore: {
        effect: localStorageEffect,
        sync: BrowserStoreSync,
    },
};

/**
 * Get the effect creator function for a given variable
 *
 * Looks up correct definition based on variable.store type
 *
 * @param variable variable to get effect for
 */
export function getEffect(variable: SingleVariable<any, PersistenceStore>): Effect | null {
    const storeName = variable.store?.__typename;

    if (!storeName) {
        return null;
    }

    return STORES[storeName].effect ?? null;
}

/**
 * Wrapper for the store providers.
 *
 * Applies all STORES around the children.
 */
export function StoreProviders({ children }: { children: React.ReactNode }): JSX.Element {
    // this could be a loop if STORES is dynamically extensible but static for now
    return (
        <BackendStoreSync>
            <BrowserStoreSync>{children}</BrowserStoreSync>
        </BackendStoreSync>
    );
}
