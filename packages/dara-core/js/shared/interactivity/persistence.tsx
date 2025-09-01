import { mixed } from '@recoiljs/refine';
import { applyPatch } from 'fast-json-patch';
import isEqual from 'lodash/isEqual';
import mapValues from 'lodash/mapValues';
import * as React from 'react';
import {
    type Params,
    type UIMatch,
    generatePath,
    useLocation,
    useMatches,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import {
    type AtomEffect,
    DefaultValue,
    RecoilLoadable,
    type RecoilState,
    atom,
    useRecoilCallback,
    useRecoilState,
} from 'recoil';
import {
    type ItemSnapshot,
    type ListenToItems,
    type ReadItem,
    RecoilSync,
    type UpdateItem,
    type WriteItems,
    syncEffect,
    urlSyncEffect,
} from 'recoil-sync';

import { useLatestRef, validateResponse } from '@darajs/ui-utils';

import { type BackendStorePatchMessage, type WebSocketClientInterface } from '@/api';
import { RequestExtrasSerializable, request } from '@/api/http';
import { handleAuthErrors } from '@/auth/auth';
import { getSessionToken } from '@/auth/use-session-token';
import { isEmbedded } from '@/shared/utils/embed';
import {
    type GlobalTaskContext,
    type PathParamStore,
    type QueryParamStore,
    type RouteDefinition,
    type SingleVariable,
    isDerivedVariable,
} from '@/types';
import { type BackendStore, type BrowserStore, type DerivedVariable, type PersistenceStore } from '@/types/core';

import { WebSocketCtx } from '../context';
import { usePrevious } from '../utils';
// eslint-disable-next-line import/no-cycle
import { getOrRegisterDerivedVariableValue } from './internal';
import { atomFamilyMembersRegistry, atomFamilyRegistry, atomRegistry } from './store';

/**
 * Global map to store the extras for each store uid
 */
const STORE_EXTRAS_MAP = new Map<string, RequestExtrasSerializable>();

/**
 * Global map from store uid to set of variable uids that use that store
 */
const STORE_VARIABLE_MAP = new Map<string, Set<string>>();

/**
 * Global map to track expected sequence numbers per store for patch validation
 */
const STORE_SEQUENCE_MAP = new Map<string, number>();

/**
 * Global map to track the latest read value for each store, to prevent cyclic updates
 */
const STORE_LATEST_VALUE_MAP = new Map<string, any>();

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
        const serializableExtras = STORE_EXTRAS_MAP.get(itemKey)!;
        const response = await request(`/api/core/store/${itemKey}`, {}, serializableExtras?.extras ?? {});
        await handleAuthErrors(response, true);
        await validateResponse(response, `Failed to fetch the store value for key: ${itemKey}`);
        const { value, sequence_number } = await response.json();

        STORE_LATEST_VALUE_MAP.set(itemKey, value);
        STORE_SEQUENCE_MAP.set(itemKey, sequence_number);

        return value;
    }, []);

    const syncStoreValues = React.useCallback<WriteItems>(
        async ({ diff }) => {
            // keep track of extras -> diff to send each set of extras as a separate request
            const extrasMap = new Map<RequestExtrasSerializable, Record<string, any>>();

            Array.from(diff.entries())
                .filter(
                    ([itemKey, value]) =>
                        !STORE_LATEST_VALUE_MAP.has(itemKey) || STORE_LATEST_VALUE_MAP.get(itemKey) !== value
                )
                .forEach(([itemKey, value]) => {
                    STORE_LATEST_VALUE_MAP.set(itemKey, value);

                    const extras = STORE_EXTRAS_MAP.get(itemKey)!;

                    if (!extrasMap.has(extras)) {
                        extrasMap.set(extras, {});
                    }

                    // store the value in the extras map
                    extrasMap.get(extras)![itemKey] = value;
                });

            async function sendRequest(
                serializableExtras: RequestExtrasSerializable,
                storeDiff: Record<string, any>
            ): Promise<void> {
                const response = await request(
                    `/api/core/store`,
                    {
                        body: JSON.stringify({
                            values: storeDiff,
                            ws_channel: await client.getChannel(),
                        }),
                        method: 'POST',
                    },
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
        },
        [client]
    );

    const applyPatchesToAtoms = useRecoilCallback(
        ({ snapshot, set }) =>
            async (
                storeUid: string,
                patches: BackendStorePatchMessage['message']['patches'],
                sequenceNumber: number
            ) => {
                // Validate sequence number to ensure UI state is in sync with backend
                const expectedSequence = STORE_SEQUENCE_MAP.get(storeUid) || 0;
                if (sequenceNumber !== expectedSequence + 1) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `Sequence number mismatch for store ${storeUid}. Expected: ${expectedSequence + 1}, Got: ${sequenceNumber}. Rejecting patch.`
                    );
                    // Could trigger a full state refresh here in the future
                    return;
                }

                // Update expected sequence number
                STORE_SEQUENCE_MAP.set(storeUid, sequenceNumber);

                // Get all variable UIDs that use this store
                const variableUids = STORE_VARIABLE_MAP.get(storeUid);
                if (!variableUids) {
                    return;
                }

                // Collect all atoms that need patching
                const atomsToUpdate: Array<{ atom: RecoilState<any>; variableUid: string }> = [];

                for (const variableUid of variableUids) {
                    // Check if there's a direct atom
                    const directAtom = atomRegistry.get(variableUid);
                    if (directAtom) {
                        atomsToUpdate.push({ atom: directAtom, variableUid });
                        continue;
                    }

                    // Check if there's an atom family
                    const atomFamily = atomFamilyRegistry.get(variableUid);
                    if (atomFamily) {
                        const familyMembers = atomFamilyMembersRegistry.get(atomFamily);
                        if (familyMembers) {
                            // Add all instances of this atom family
                            for (const [, atomInstance] of familyMembers) {
                                atomsToUpdate.push({ atom: atomInstance, variableUid });
                            }
                        }
                    }
                }

                // Batch read all current values
                const currentValues = await Promise.all(
                    atomsToUpdate.map(async ({ atom, variableUid }) => {
                        try {
                            return {
                                atom,
                                variableUid,
                                currentValue: await snapshot.getPromise(atom),
                                error: null as Error | null,
                            };
                        } catch (error) {
                            return {
                                atom,
                                variableUid,
                                currentValue: null,
                                error: error as Error,
                            };
                        }
                    })
                );

                const applyPatchToValue = (currentValue: any, variableUid: string): any => {
                    try {
                        return applyPatch(currentValue, patches as any, false, false).newDocument;
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.warn(`Failed to apply patch to atom ${variableUid}:`, error);
                        return currentValue; // Return unchanged value on error
                    }
                };

                // Apply patches and set new values
                currentValues.forEach(({ atom, variableUid, currentValue, error }) => {
                    if (error) {
                        // eslint-disable-next-line no-console
                        console.warn(`Failed to read current value for atom ${variableUid}:`, error);
                        return;
                    }

                    const patchedValue = applyPatchToValue(currentValue, variableUid);
                    set(atom, patchedValue);
                    STORE_LATEST_VALUE_MAP.set(storeUid, patchedValue);
                });
            },
        []
    );

    const listenToStoreChanges = React.useCallback<ListenToItems>(
        ({ updateItem }) => {
            if (!client) {
                return;
            }

            // Subscribe to regular value updates
            const valueSub = client.backendStoreMessages$().subscribe((message) => {
                // Set sequence number when full value is received
                STORE_SEQUENCE_MAP.set(message.store_uid, message.sequence_number);
                updateItem(message.store_uid, message.value);
                STORE_LATEST_VALUE_MAP.set(message.store_uid, message.value);
            });

            // Subscribe to patch updates
            const patchSub = client.backendStorePatchMessages$().subscribe((message) => {
                // Apply patches directly to atoms instead of going through RecoilSync
                applyPatchesToAtoms(message.store_uid, message.patches, message.sequence_number);
            });

            return () => {
                valueSub.unsubscribe();
                patchSub.unsubscribe();
            };
        },
        [client, applyPatchesToAtoms]
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
    STORE_EXTRAS_MAP.set(variable.store!.uid, requestExtras);

    // Register this variable as using this store for patch handling
    if (!STORE_VARIABLE_MAP.has(variable.store!.uid)) {
        STORE_VARIABLE_MAP.set(variable.store!.uid, new Set());
    }
    STORE_VARIABLE_MAP.get(variable.store!.uid)!.add(variable.uid);

    return syncEffect({
        /** Use store uid as the unique identifier */
        itemKey: variable.store!.uid,
        refine: mixed(),
        storeKey: 'BackendStore',
        write({ write }, newValue) {
            // If store is read-only, do not write - this is a no-op
            if (variable.store!.readonly) {
                return;
            }

            // skip writing default values
            if (newValue instanceof DefaultValue) {
                return;
            }

            write(variable.store!.uid, newValue);
        },
    });
}

/**
 * Get the session key used to persist a variable value
 *
 * @param uid uid of the variable to persist
 */
export function getSessionKey(uid: string): string {
    // If we're within an IFrame (Jupyter)
    if (isEmbedded()) {
        return `dara-session-${(window.frameElement as HTMLIFrameElement).dataset.daraPageId}-var-${uid}`;
    }

    return `dara-session-${getSessionToken()}-var-${uid}`;
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
    const getStoreValue = React.useCallback<ReadItem>((itemKey) => {
        const key = getSessionKey(itemKey);
        return JSON.parse(localStorage.getItem(key) ?? 'null');
    }, []);

    const syncStoreValues = React.useCallback<WriteItems>(({ diff }) => {
        for (const [itemKey, value] of diff.entries()) {
            const key = getSessionKey(itemKey);
            localStorage.setItem(key, JSON.stringify(value));
        }
    }, []);

    /**
     * Listen to storage events and update the store when a change is detected.
     *
     * This is useful to keep the store in sync across tabs.
     */
    const listenToStoreChanges = React.useCallback<ListenToItems>(({ updateItem }) => {
        const listener = (e: StorageEvent): void => {
            if (e.storageArea === localStorage) {
                if (e.key) {
                    // check if the key matches our dara-session key
                    const match = e.key.match(/^dara-session-(.*)-var-(.*)$/);
                    if (match) {
                        const [, sessionToken, uid] = match;
                        if (sessionToken === getSessionToken()) {
                            updateItem(uid!, JSON.parse(e.newValue ?? 'null'));
                        }
                    }
                }
            }
        };

        window.addEventListener('storage', listener);

        return () => {
            window.removeEventListener('storage', listener);
        };
    }, []);

    return (
        <RecoilSync listen={listenToStoreChanges} read={getStoreValue} storeKey="BrowserStore" write={syncStoreValues}>
            {children}
        </RecoilSync>
    );
}

function PathParamSync({ children }: { children: React.ReactNode }): React.ReactNode {
    const navigate = useNavigate();

    const location = useLocation();
    const locationRef = useLatestRef(location);

    const matches = useMatches();
    const matchesRef = useLatestRef(matches);

    // Keep track of matches in a ref.
    // This lets us mutate it in the `write` part and have `read` return the latest value.
    const params = useParams();
    const paramsRef = React.useRef(params);

    const locationSubscribers = React.useRef<Array<(params: Params<string>) => void>>([]);

    React.useLayoutEffect(() => {
        // always sync on initial load, then only if params change
        if (isEqual(paramsRef.current, params)) {
            return;
        }
        paramsRef.current = params;
        for (const subscriber of locationSubscribers.current) {
            subscriber(params);
        }
    }, [paramsRef, params]);

    const getStoreValue = React.useCallback<ReadItem>(
        (paramName) => {
            return paramsRef.current[paramName] ?? null;
        },
        [paramsRef]
    );

    const writeStoreValue = React.useCallback<WriteItems>(
        ({ diff }) => {
            const newParams = mapValues({ ...paramsRef.current, ...Object.fromEntries(diff) }, (v) => String(v));

            // use the last match to get the full path,
            // needed to get the full path with placeholders e.g.
            // /foo/blogs/:blogId/posts/:postId
            const fullPathname = (
                matchesRef.current.at(-1)!.loaderData as {
                    data: { route_definition: RouteDefinition };
                }
            ).data.route_definition.full_path;

            // navigate once, building the full pathname with updated params
            // NOTE: This assumes the path param names are unique across matches
            // which we currently validate in the router compilation step
            navigate({
                pathname: generatePath(fullPathname, newParams),
                // preserve current search
                search: locationRef.current.search,
            });
        },
        [matchesRef, navigate, paramsRef, locationRef]
    );

    const listenToStoreChanges = React.useCallback<ListenToItems>(({ updateAllKnownItems }) => {
        function handleUpdate(newParams: Params<string>): void {
            // this updates existing atoms for items included and resets other ones
            // to default (null/None) for missing ones
            updateAllKnownItems(new Map(Object.entries(newParams)));
        }

        locationSubscribers.current.push(handleUpdate);

        return () => {
            locationSubscribers.current = locationSubscribers.current.filter((item) => item !== handleUpdate);
        };
    }, []);

    return (
        <RecoilSync
            listen={listenToStoreChanges}
            read={getStoreValue}
            write={writeStoreValue}
            storeKey="_PathParamStore"
        >
            {children}
        </RecoilSync>
    );
}

/**
 * Create a syncEffect for BrowserStore
 *
 * @param variable variable to create effect for
 */
function localStorageEffect<T>(
    variable: SingleVariable<T, any>,
    extrasSerializable: RequestExtrasSerializable,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext
): AtomEffect<any> {
    let firstRun = false;

    return syncEffect({
        itemKey: variable.uid,
        read: ({ read }) => {
            const readValue = read(variable.uid);

            if (!firstRun) {
                firstRun = true;

                // during first run fall back to the default value if the read value is null
                // as local storage might not have been initialized yet
                if (!readValue) {
                    const isDefaultDerived = isDerivedVariable(variable.default);

                    return isDefaultDerived ?
                            getOrRegisterDerivedVariableValue(
                                variable.default as DerivedVariable,
                                wsClient,
                                taskContext,
                                extrasSerializable.extras
                            )
                        :   variable.default;
                }
            }

            return readValue;
        },
        refine: mixed(),
        storeKey: 'BrowserStore',
    });
}

function urlEffect<T>(variable: SingleVariable<T, QueryParamStore>): AtomEffect<any> {
    return urlSyncEffect({
        history: 'push',
        itemKey: variable.store!.query,
        refine: mixed(),
    });
}

function pathParamEffect<T>(variable: SingleVariable<T, PathParamStore>): AtomEffect<any> {
    const itemKey = variable.store!.param_name;
    const effect = syncEffect({
        itemKey,
        refine: mixed(),
        storeKey: '_PathParamStore',
    });
    return (effectParams) => {
        const cleanup = effect(effectParams);
        // NOTE: this is a hack to immediately commit the value of the atom to the recoil snapshot
        // Without this, the first time we try to read it in e.g. an action, the value is null
        // I wasn't able to find why this happens, but this seems to work.
        // `valueOrThrow` should be safe here as we always initialize the atom in the syncEffect.
        effectParams.setSelf(effectParams.getLoadable(effectParams.node).valueOrThrow());
        return () => {
            cleanup?.();
        };
    };
}

interface Effect<T = any, TStore extends PersistenceStore = PersistenceStore> {
    (
        variable: SingleVariable<T, TStore>,
        requestExtras: RequestExtrasSerializable,
        wsClient: WebSocketClientInterface,
        taskContext: GlobalTaskContext
    ): AtomEffect<T>;
}

// Type-safe mapping from store __typename to store type
type StoreTypeMap = {
    BackendStore: BackendStore;
    BrowserStore: BrowserStore;
    QueryParamStore: QueryParamStore;
    _PathParamStore: PathParamStore;
};

// Type-safe STORES configuration
type StoresConfig = {
    [K in keyof StoreTypeMap]: {
        effect: Effect<any, StoreTypeMap[K]>;
    };
};

export const STORES: StoresConfig = {
    BackendStore: {
        effect: backendStoreEffect,
    },
    BrowserStore: {
        effect: localStorageEffect,
    },
    QueryParamStore: {
        effect: urlEffect,
    },
    _PathParamStore: {
        effect: pathParamEffect,
    },
};

/**
 * Get the effect creator function for a given variable
 *
 * Looks up correct definition based on variable.store type
 *
 * @param variable variable to get effect for
 */
export function getEffect<T, StoreType extends PersistenceStore>(
    variable: SingleVariable<T, StoreType>
): Effect<T, StoreType> | null {
    const storeName = variable.store?.__typename;

    if (!storeName || !(storeName in STORES)) {
        return null;
    }

    // Type assertion is safe here because we've checked the key exists
    return (STORES as any)[storeName]?.effect ?? null;
}

/**
 * Wrapper for the store providers.
 *
 * Applies all STORES around the children.
 */
export function StoreProviders({ children }: { children: React.ReactNode }): JSX.Element {
    // this could be a loop if STORES is dynamically extensible but static for now
    // NOTE: the url sync is applied separately as it needs to be wrapped around the router
    return (
        <BackendStoreSync>
            <PathParamSync>
                <BrowserStoreSync>{children}</BrowserStoreSync>
            </PathParamSync>
        </BackendStoreSync>
    );
}
