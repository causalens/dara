import { mixed } from '@recoiljs/refine';
import React from 'react';
import { type AtomEffect, type RecoilState, atomFamily } from 'recoil';
import { type ListenToItems, type ReadItem, RecoilSync, syncEffect } from 'recoil-sync';

import { validateResponse } from '@darajs/ui-utils';

import { type RequestExtras, RequestExtrasSerializable, request } from '@/api/http';
import { handleAuthErrors } from '@/auth/auth';
import { type ResolvedServerVariable, type ServerVariable } from '@/types';

import { WebSocketCtx } from '../context';
import { StateSynchronizer } from './state-synchronizer';
import { atomFamilyMembersRegistry, atomFamilyRegistry } from './store';

/**
 * Global map to store the extras for each store uid
 */
const STORE_EXTRAS_MAP = new Map<string, RequestExtrasSerializable>();

/**
 * Create a syncEffect for server variable
 *
 * @param variable variable to create the atom effect for
 * @param requestExtras extras object to create the effect for; used to pass through correct extras to write requests
 */
function serverSyncEffect(variable: ServerVariable, requestExtras: RequestExtrasSerializable): AtomEffect<any> {
    // Assumption: the set of extras is unique to the store, i.e. the variable will not be used under different sets of extras
    // Otherwise we sync multiple different stores but then we treat them as the same atom, which would cause issues
    STORE_EXTRAS_MAP.set(variable.uid, requestExtras);

    return syncEffect({
        /** Use store uid as the unique identifier */
        itemKey: variable.uid,
        refine: mixed(),
        storeKey: 'ServerVariable',
    });
}

const STATE_SYNCHRONIZER = new StateSynchronizer();

/**
 * Get or register a server variable from the atom registry
 *
 * @param variable variable to register
 * @param extras request extras to be merged into the options
 */
export function getOrRegisterServerVariable(variable: ServerVariable, extras: RequestExtras): RecoilState<number> {
    if (!atomFamilyRegistry.has(variable.uid)) {
        atomFamilyRegistry.set(
            variable.uid,
            atomFamily({
                // NOTE: No default provided, atom starts in a pending state
                effects: (extrasSerializable: RequestExtrasSerializable) => {
                    // Effect to synchronize changes across atoms of the same family
                    const familySync: AtomEffect<any> = ({ onSet, setSelf, resetSelf, node }) => {
                        // Register the atom in the state synchronizer if not already registered
                        if (!STATE_SYNCHRONIZER.isRegistered(variable.uid)) {
                            STATE_SYNCHRONIZER.register(variable.uid, null);
                        } else {
                            const currentState = STATE_SYNCHRONIZER.getCurrentState(variable.uid);

                            if (currentState?.type !== 'initial') {
                                // Otherwise synchronize the initial value
                                setSelf(currentState?.value);
                            }
                        }

                        // Synchronize changes across atoms of the same family
                        const unsub = STATE_SYNCHRONIZER.subscribe(variable.uid, (update) => {
                            if (update.type === 'initial') {
                                return;
                            }

                            // skip updates from the same atom
                            if (update.nodeKey === node.key) {
                                return;
                            }

                            if (update.isReset) {
                                resetSelf();
                            } else {
                                setSelf(update.value);
                            }
                        });

                        onSet((newValue, oldValue, isReset) => {
                            STATE_SYNCHRONIZER.notify(variable.uid, {
                                isReset,
                                nodeKey: node.key,
                                oldValue,
                                type: 'update',
                                value: newValue,
                            });
                        });

                        return unsub;
                    };

                    return [familySync, serverSyncEffect(variable, extrasSerializable)];
                },
                key: variable.uid,
            })
        );
    }

    const family = atomFamilyRegistry.get(variable.uid)!;
    const extrasSerializable = new RequestExtrasSerializable(extras);
    const atomInstance: RecoilState<any> = family(extrasSerializable);

    // Register the atom instance in the atomFamilyMembersRegistry so we can retrieve it later
    if (!atomFamilyMembersRegistry.has(family)) {
        atomFamilyMembersRegistry.set(family, new Map());
    }
    atomFamilyMembersRegistry.get(family)!.set(extrasSerializable.toJSON(), atomInstance);

    return atomInstance;
}

/** Resolve a server variable to its resolved form  */
export async function resolveServerVariable(
    variable: ServerVariable,
    extras: RequestExtras,
    resolver: (state: RecoilState<any>) => Promise<any>
): Promise<ResolvedServerVariable> {
    const atom = getOrRegisterServerVariable(variable, extras);
    // the value stored on the client is the sequence number
    const seqNumber = await resolver(atom);
    return {
        type: 'server',
        uid: variable.uid,
        sequence_number: seqNumber,
    } satisfies ResolvedServerVariable;
}

/**
 * RecoilSync implementation for ServerVariable
 *
 * - read: GET from /api/core/store/:store_uid
 * - listen: subscribed to `serverVariableMessages$` on WsClient
 */
export function ServerVariableSyncProvider({ children }: { children: React.ReactNode }): JSX.Element {
    const { client } = React.useContext(WebSocketCtx);

    const getStoreValue = React.useCallback<ReadItem>(async (itemKey) => {
        const serializableExtras = STORE_EXTRAS_MAP.get(itemKey)!;
        const response = await request(
            `/api/core/server-variable/${itemKey}/sequence`,
            serializableExtras?.extras ?? {}
        );
        await handleAuthErrors(response, true);
        await validateResponse(response, `Failed to fetch the sequence number for key: ${itemKey}`);
        const { sequence_number } = await response.json();
        return sequence_number;
    }, []);

    const listenToStoreChanges = React.useCallback<ListenToItems>(
        ({ updateItem }) => {
            if (!client) {
                return;
            }

            // Subscribe to regular value updates
            const valueSub = client.serverVariableMessages$().subscribe((message) => {
                updateItem(message.uid, message.sequence_number);
            });

            return () => {
                valueSub.unsubscribe();
            };
        },
        [client]
    );

    return (
        <RecoilSync listen={listenToStoreChanges} read={getStoreValue} storeKey="ServerVariable">
            {children}
        </RecoilSync>
    );
}
