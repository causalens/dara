import { AtomEffect, RecoilState, atomFamily, selectorFamily } from 'recoil';
import { BehaviorSubject } from 'rxjs';

import { WebSocketClientInterface } from '@/api';
import { RequestExtras, RequestExtrasSerializable } from '@/api/http';
import { isEmbedded } from '@/shared/utils/embed';
import { DerivedVariable, GlobalTaskContext, SingleVariable, isDerivedVariable } from '@/types';

// eslint-disable-next-line import/no-cycle
import { STORES, getEffect, getOrRegisterDerivedVariableValue, resolveNested, setNested } from './internal';
import { atomFamilyMembersRegistry, atomFamilyRegistry, getRegistryKey, selectorFamilyRegistry } from './store';

type VariableUpdate =
    | { type: 'initial'; value: any }
    | { isReset: boolean; nodeKey: string; oldValue: any; type: 'update'; value: any };

/**
 * State synchronizer singleton
 *
 * Used to synchronize changes across atoms of the same family
 */
class StateSynchronizer {
    static #instance: StateSynchronizer;

    #observers = new Map<string, BehaviorSubject<VariableUpdate>>();

    // eslint-disable-next-line no-useless-constructor, no-empty-function
    private constructor() {}

    static getInstance(): StateSynchronizer {
        if (!StateSynchronizer.#instance) {
            StateSynchronizer.#instance = new StateSynchronizer();
        }

        return StateSynchronizer.#instance;
    }

    /**
     * Register a key in the state synchronizer
     *
     * @param key key to register
     * @param defaultValue value to register
     */
    register(key: string, defaultValue: any): void {
        if (!this.#observers.has(key)) {
            this.#observers.set(key, new BehaviorSubject({ type: 'initial', value: defaultValue }));
        }
    }

    /**
     * Check if a given key is registered in the state synchronizer
     *
     * @param key key to check if registered
     */
    isRegistered(key: string): boolean {
        return this.#observers.has(key);
    }

    /**
     * Get the current state for a given key
     *
     * @param key key to get the current value for
     */
    getCurrentState(key: string): VariableUpdate {
        if (!this.isRegistered(key)) {
            return null;
        }
        return this.#observers.get(key).getValue();
    }

    /**
     * Subscribe to changes on a given key
     *
     * @param key key to subscribe to
     */
    subscribe(key: string, subscription: Parameters<BehaviorSubject<VariableUpdate>['subscribe']>[0]): () => void {
        // If somehow the ended up with no listener here, register it with null value
        if (!this.isRegistered(key)) {
            this.register(key, null);
        }

        const sub = this.#observers.get(key).subscribe(subscription);
        return () => {
            sub.unsubscribe();

            // if no more observers, remove the listener
            if (this.#observers.get(key).observers.length === 0) {
                this.#observers.delete(key);
            }
        };
    }

    /**
     * Notify listeners for a given key
     *
     * @param key key to notify listeners for
     * @param update update to notify about
     */
    notify(key: string, update: VariableUpdate): void {
        // If somehow the ended up with no listener here, register it with null value
        if (!this.isRegistered(key)) {
            this.register(key, null);
        }
        this.#observers.get(key).next(update);
    }
}

/**
 * Get a plain variable from the atom or selector registry (based on nested property),
 * registering it if not already registered
 *
 * @param variable variable to register
 * @param wsClient websocket client
 * @param taskContext task context
 * @param search search query
 * @param extras request extras to be merged into the options
 */
export function getOrRegisterPlainVariable<T>(
    variable: SingleVariable<T>,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras
): RecoilState<T> {
    const isNested = variable.nested && variable.nested.length > 0;
    const isDefaultDerived = isDerivedVariable(variable.default);

    if (!atomFamilyRegistry.has(variable.uid)) {
        atomFamilyRegistry.set(
            variable.uid,
            atomFamily({
                /*
                If created from a DerivedVariable, link the default state to that DV's selector
                From Recoil docs:
                "If a selector is used as the default the atom will dynamically update as the default selector updates.
                Once the atom is set, then it will retain that value unless the atom is reset."

                Otherwise just use variable.default directly.
                */
                default:
                    isDefaultDerived ?
                        (extrasSerializable: RequestExtrasSerializable) =>
                            getOrRegisterDerivedVariableValue(
                                variable.default as DerivedVariable,
                                wsClient,
                                taskContext,
                                extrasSerializable.extras
                            )
                    :   variable.default,
                effects: (extrasSerializable: RequestExtrasSerializable) => {
                    const familySync: AtomEffect<T> = ({ onSet, setSelf, resetSelf, node }) => {
                        // Register the atom in the state synchronizer if not already registered
                        if (!StateSynchronizer.getInstance().isRegistered(variable.uid)) {
                            StateSynchronizer.getInstance().register(variable.uid, variable.default);
                        } else {
                            const currentState = StateSynchronizer.getInstance().getCurrentState(variable.uid);

                            if (!isDefaultDerived || currentState?.type !== 'initial') {
                                // Otherwise synchronize the initial value,
                                // unless the default is a DerivedVariable and the current state is initial
                                // because in that case the default will be linked to the selector which needs to be resolved
                                setSelf(currentState?.value);
                            }
                        }

                        // Synchronize changes across atoms of the same family
                        const unsub = StateSynchronizer.getInstance().subscribe(variable.uid, (update) => {
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
                            StateSynchronizer.getInstance().notify(variable.uid, {
                                isReset,
                                nodeKey: node.key,
                                oldValue,
                                type: 'update',
                                value: newValue,
                            });
                        });

                        return unsub;
                    };

                    const effects: AtomEffect<T>[] = [familySync];

                    // add an effect to handle backend store updates
                    const storeEffect = getEffect(variable);
                    if (storeEffect) {
                        effects.push(storeEffect(variable, extrasSerializable, wsClient, taskContext));
                    } else {
                        // TODO: This is in an else block to ensure store effect are mutually exclusive, can be unified once backend API is unified
                        // If persist_value flag is set, register an effect which updates the selected value in local storage
                        // TODO: once BrowserStore is implemented instead of persist_value, this block can only check for isEmbedded
                        // eslint-disable-next-line no-lonely-if
                        if (variable.persist_value || isEmbedded()) {
                            effects.push(
                                STORES.BrowserStore.effect(variable, extrasSerializable, wsClient, taskContext)
                            );
                        }
                    }

                    return effects;
                },
                key: variable.uid,
            })
        );
    }

    const family = atomFamilyRegistry.get(variable.uid);
    const extrasSerializable = new RequestExtrasSerializable(extras);
    const atomInstance: RecoilState<T> = family(extrasSerializable);

    // Register the atom instance in the atomFamilyMembersRegistry so we can retrieve it later
    if (!atomFamilyMembersRegistry.has(family)) {
        atomFamilyMembersRegistry.set(family, new Map());
    }
    atomFamilyMembersRegistry.get(family).set(extrasSerializable.toJSON(), atomInstance);

    // In case of a nested variable, register and return a selector to resolve the nested values
    if (isNested) {
        const key = getRegistryKey(variable, 'selector');

        if (!selectorFamilyRegistry.has(key)) {
            // Below we make sure nested is a list of strings
            // this is validated on the Python side but when using @template we can't validate it and is replaced at runtime
            // so we coerce it to a list of strings here
            selectorFamilyRegistry.set(
                key,
                selectorFamily({
                    get:
                        (currentExtras: RequestExtrasSerializable) =>
                        ({ get }) => {
                            const variableValue = get(family(currentExtras));

                            return resolveNested(
                                variableValue,
                                variable.nested.map((n) => String(n))
                            );
                        },
                    key,
                    set:
                        (currentExtras: RequestExtrasSerializable) =>
                        ({ set }, newValue) => {
                            set(family(currentExtras), (v: Record<string, any>) =>
                                setNested(
                                    v,
                                    variable.nested.map((n) => String(n)),
                                    newValue
                                )
                            );
                        },
                })
            );
        }
        const selectorFamilyInstance = selectorFamilyRegistry.get(key);

        // We cast it since it's a writeable selector
        return selectorFamilyInstance(extrasSerializable) as RecoilState<T>;
    }

    return atomInstance;
}
