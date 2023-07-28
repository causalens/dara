import { RecoilState, atom, useRecoilValue } from 'recoil';

import { WebSocketClientInterface } from '@/api';
import {
    AnyVariable,
    DataVariable,
    DerivedDataVariable,
    DerivedVariable,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
} from '@/types';

import { TriggerIndexValue, atomRegistry, dataRegistry, getRegistryKey } from './store';

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
                    force: false,
                    inc: 0,
                },
                key: triggerKey,
            })
        );
    }

    return atomRegistry.get(triggerKey);
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
                    force: true,
                    inc: 0,
                },
                effects: [
                    // synchronize with server triggers - increment when the variable is triggered on the server side
                    ({ setSelf }) => {
                        const subscription = wsClient.serverTriggers$(variable.uid).subscribe(() => {
                            setSelf((v) => {
                                if (typeof v === 'object' && 'inc' in v) {
                                    return {
                                        force: true,
                                        inc: v.inc + 1,
                                    };
                                }
                                return {
                                    force: true,
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

    return dataRegistry.get(key);
}

/**
 * Recursively register triggers as dependencies by calling the registerFunc on all nested derived variables
 *
 * @param variable variable to register triggers for
 * @param wsClient websocket client
 * @param registerFunc register function to run
 */
export function registerTriggers(
    variable: DerivedVariable | DerivedDataVariable,
    wsClient: WebSocketClientInterface,
    registerFunc: (state: RecoilState<any>) => TriggerIndexValue = useRecoilValue
): Array<TriggerIndexValue> {
    const triggers: TriggerIndexValue[] = [];

    // Register the variable itself
    const triggerIndex = getOrRegisterTrigger(variable);
    triggers.push(registerFunc(triggerIndex));

    // Register nested derived and data variables triggers recursively
    variable.variables.forEach((v) => {
        if (isDerivedVariable(v) || isDerivedDataVariable(v)) {
            triggers.push(...registerTriggers(v, wsClient, registerFunc));
        }
        if (isDataVariable(v)) {
            const serverTrigger = getOrRegisterDataVariableTrigger(v, wsClient);
            triggers.push(registerFunc(serverTrigger));
        }
    });

    return triggers;
}

/**
 * Recursively register triggers in the list of dependant variables
 *
 * @param variable variable to register triggers for
 * @param wsClient websocket client
 * @param registerFunc register function to run
 */
export function registerChildTriggers(
    variables: AnyVariable<any>[],
    wsClient: WebSocketClientInterface,
    registerFunc: (state: RecoilState<any>) => TriggerIndexValue = useRecoilValue
): Array<TriggerIndexValue> {
    const triggers: TriggerIndexValue[] = [];

    variables.forEach((v) => {
        if (isDerivedVariable(v) || isDerivedDataVariable(v)) {
            triggers.push(...registerTriggers(v, wsClient, registerFunc));
        }
        if (isDataVariable(v)) {
            const serverTrigger = getOrRegisterDataVariableTrigger(v, wsClient);
            triggers.push(registerFunc(serverTrigger));
        }
    });

    return triggers;
}
