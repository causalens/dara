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

function BackendStoreSync({ children }: { children: React.ReactNode }): JSX.Element {
    const { client } = React.useContext(WebSocketCtx);
    const extras = useRequestExtras();

    const getStoreValue = React.useCallback<ReadItem>(
        async (itemKey) => {
            const response = await request(`/api/core/store/${itemKey}`, {}, extras);
            await handleAuthErrors(response, true);
            await validateResponse(response, `Failed to fetch the store value for key: ${itemKey}`);
            const val = await response.json();

            return val;
        },
        [extras]
    );

    const syncStoreValues = React.useCallback<WriteItems>(async ({ diff }) => {
        // keep track of extras -> diff
        const extrasMap = new Map<string, Record<string, any>>();

        // diff is a map of encoded key -> value, first decode each key and value
        for (const [encodedKey, value] of diff.entries()) {
            const { serializedExtras, store_uid } = JSON.parse(encodedKey) as {
                serializedExtras: string;
                store_uid: string;
            };

            if (!extrasMap.has(serializedExtras)) {
                extrasMap.set(serializedExtras, {});
            }

            // store the value in the extras map
            extrasMap.get(serializedExtras)[store_uid] = value;
        }

        // Send a request with each different set of extras
        async function sendRequest(serializedExtras: string, storeDiff: Record<string, any>): Promise<void> {
            const response = await request(
                `/api/core/store`,
                { body: JSON.stringify(storeDiff), method: 'POST' },
                JSON.parse(serializedExtras)
            );
            await handleAuthErrors(response, true);
            await validateResponse(response, `Failed to sync the store values`);
        }

        await Promise.allSettled(
            Array.from(extrasMap.entries()).map(([serializedExtras, storeDiff]) =>
                sendRequest(serializedExtras, storeDiff)
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

function backendStoreEffect<T>(
    variable: SingleVariable<T, BackendStore>,
    requestExtras: RequestExtrasSerializable
): AtomEffect<any> {
    return syncEffect({
        /** Use store uid as the unique identifier */
        itemKey: variable.store.uid,
        refine: mixed(),
        storeKey: 'BackendStore',
        /**
         * This customizes how the value is written to the diff object then passed to the write function in the sync component.
         */
        write: ({ write }, newValue) => {
            // encode the request extras into the key used so they can be passed through to the request
            write(
                JSON.stringify({
                    serializedExtras: requestExtras.toJSON(),
                    store_uid: variable.store.uid,
                }),
                newValue
            );
        },
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

function localStorageEffect<T>(variable: SingleVariable<T, PersistenceStore>): AtomEffect<any> {
    let firstRun = true;

    return syncEffect({
        itemKey: variable.uid,
        read: ({ read }) => {
            const readValue = read(variable.uid);

            if (firstRun) {
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
    return (
        <BackendStoreSync>
            <BrowserStoreSync>{children}</BrowserStoreSync>
        </BackendStoreSync>
    );
}
