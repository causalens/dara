import { nanoid } from 'nanoid';
import { type RecoilState, atom, useRecoilValue } from 'recoil';

import { type WebSocketClientInterface } from '@/api';
import {
    type DataVariable,
    type DerivedDataVariable,
    type DerivedVariable,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
} from '@/types';

import { type TriggerIndexValue, atomRegistry, dataRegistry, getRegistryKey } from './store';

/**
 * Information about a trigger in the variable tree
 */
export interface TriggerInfo {
    /** Path to the variable that owns this trigger */
    path: string[];
    /** The variable that owns this trigger */
    variable: DerivedVariable | DerivedDataVariable | DataVariable;
}

/**
 * Get a trigger index for a variable from the atom registry, registering it if not already registered
 *
 * @param variable variable to register trigger for
 */
export function getOrRegisterTrigger(variable: DerivedVariable | DerivedDataVariable): RecoilState<TriggerIndexValue> {
    const triggerKey = getRegistryKey(variable, 'trigger');

    if (!atomRegistry.has(triggerKey)) {
        atomRegistry.set(
            triggerKey,
            atom({
                default: {
                    force_key: null,
                    inc: 0,
                } satisfies TriggerIndexValue,
                key: triggerKey,
            })
        );
    }

    return atomRegistry.get(triggerKey)!;
}

/**
 * Get the data variable server trigger atom if it exists, otherwise create it
 */
export function getOrRegisterDataVariableTrigger(
    variable: DataVariable,
    wsClient: WebSocketClientInterface
): RecoilState<TriggerIndexValue> {
    // get or create an observable for the data variable
    const key = `${variable.uid}-data`;
    if (!dataRegistry.has(key)) {
        dataRegistry.set(
            key,
            atom({
                default: {
                    force_key: null,
                    inc: 0,
                } as TriggerIndexValue,
                effects: [
                    // synchronize with server triggers - increment when the variable is triggered on the server side
                    // In the DataVariable case we always force so new key is generated
                    ({ setSelf }) => {
                        const subscription = wsClient.serverTriggers$(variable.uid).subscribe(() => {
                            setSelf((v) => {
                                if (typeof v === 'object' && 'inc' in v) {
                                    return {
                                        force_key: nanoid(),
                                        inc: v.inc + 1,
                                    };
                                }
                                return {
                                    force_key: nanoid(),
                                    inc: 1,
                                };
                            });
                        });

                        return () => {
                            subscription?.unsubscribe();
                        };
                    },
                ],
                key,
            })
        );
    }

    return dataRegistry.get(key)!;
}

/**
 * Built a flat list of triggers, preserving information about the position of each trigger in the variable tree
 *
 * @param variables Array of variables to analyze
 * @returns list of triggers, with information about the variable that owns each trigger
 */
export function buildTriggerList(variables: any[]): Array<TriggerInfo> {
    const triggers: TriggerInfo[] = [];

    function walk(vars: any[], path: string[]): void {
        for (const [idx, variable] of vars.entries()) {
            if (isDerivedVariable(variable) || isDerivedDataVariable(variable)) {
                const varPath = [...path, String(idx)];
                // register trigger itself
                triggers.push({
                    path: varPath,
                    variable,
                });

                // register triggers for nested variables
                walk(variable.variables, varPath);
            }
            if (isDataVariable(variable)) {
                const varPath = [...path, String(idx)];
                triggers.push({
                    path: varPath,
                    variable,
                });
            }
        }
    }

    walk(variables, []);

    return triggers;
}

/**
 * Recursively register triggers in the list of dependant variables using a pre-built trigger list
 *
 * @param triggerList flat list of triggers to register
 * @param wsClient websocket client
 * @param registerFunc register function to run
 * @param triggerMap optional pre-built trigger map for efficiency
 */
export function registerChildTriggers(
    triggerList: Array<TriggerInfo>,
    wsClient: WebSocketClientInterface,
    registerFunc: (state: RecoilState<any>) => TriggerIndexValue = useRecoilValue
): Array<TriggerIndexValue> {
    return triggerList.map((triggerInfo) => {
        if (isDerivedVariable(triggerInfo.variable) || isDerivedDataVariable(triggerInfo.variable)) {
            const triggerIndex = getOrRegisterTrigger(triggerInfo.variable);
            return registerFunc(triggerIndex);
        }
        if (isDataVariable(triggerInfo.variable)) {
            const serverTrigger = getOrRegisterDataVariableTrigger(triggerInfo.variable, wsClient);
            return registerFunc(serverTrigger);
        }
        throw new Error('Invalid trigger variable type');
    });
}
