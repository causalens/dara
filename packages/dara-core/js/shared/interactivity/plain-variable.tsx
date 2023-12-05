import { RecoilState, atom, atomFamily, selectorFamily } from 'recoil';

import { WebSocketClientInterface } from '@/api';
import { RequestExtras, RequestExtrasSerializable } from '@/api/http';
import { GlobalTaskContext } from '@/shared/context/global-task-context';
import { isEmbedded } from '@/shared/utils/embed';
import { DerivedVariable, SingleVariable, isDerivedVariable } from '@/types';

// eslint-disable-next-line import/no-cycle
import { getOrRegisterDerivedVariableValue, resolveNested, setNested } from './internal';
import {
    AtomFamily,
    atomFamilyMembersRegistry,
    atomFamilyRegistry,
    atomRegistry,
    getRegistryKey,
    selectorFamilyRegistry,
} from './store';

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

type Listener = (...args: any[]) => void;

/**
 * State synchronizer singleton
 *
 * Used to synchronize changes across atoms of the same family
 */
class StateSynchronizer {
    static #instance: StateSynchronizer;

    #listenersMap = new Map<string, Set<Listener>>();

    // eslint-disable-next-line no-useless-constructor, no-empty-function
    private constructor() {}

    static getInstance(): StateSynchronizer {
        if (!StateSynchronizer.#instance) {
            StateSynchronizer.#instance = new StateSynchronizer();
        }

        return StateSynchronizer.#instance;
    }

    /**
     * Subscribe to changes on a given key
     *
     * @param key key to subscribe to
     * @param listener listener to invoke on change
     * @returns a cleanup function to unsubscribe
     */
    subscribe(key: string, listener: Listener): () => void {
        if (!this.#listenersMap.has(key)) {
            this.#listenersMap.set(key, new Set());
        }
        this.#listenersMap.get(key).add(listener);

        return () => {
            this.#listenersMap.get(key).delete(listener);
        };
    }

    /**
     * Notify listeners for a given key
     *
     * @param key key to notify listeners for
     * @param args arguments to pass to the listeners
     */
    notify(key: string, ...args: any[]): void {
        this.#listenersMap.get(key)?.forEach((listener) => listener(...args));
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

    let atomInstance: RecoilState<T>;
    let family: AtomFamily | null = null;

    // Variables created from DV need to be registered as atomFamily to dynamically pick up the right DV
    if (isDefaultDerived) {
        if (!atomFamilyRegistry.has(variable.uid)) {
            atomFamilyRegistry.set(
                variable.uid,
                atomFamily({
                    /*
                If created from a DerivedVariable, link the default state to that DV's selector
                From Recoil docs:
                "If a selector is used as the default the atom will dynamically update as the default selector updates.
                Once the atom is set, then it will retain that value unless the atom is reset."
                */
                    default: (extrasSerializable: RequestExtrasSerializable) =>
                        getOrRegisterDerivedVariableValue(
                            variable.default as DerivedVariable,
                            wsClient,
                            taskContext,
                            extrasSerializable.extras
                        ),
                    effects: [
                        ({ onSet, setSelf, resetSelf }) => {
                            // Synchronize changes across atoms of the same family
                            const unsub = StateSynchronizer.getInstance().subscribe(
                                variable.uid,
                                (newValue, oldValue, isReset) => {
                                    if (isReset) {
                                        resetSelf();
                                    } else {
                                        setSelf(newValue);
                                    }
                                }
                            );

                            onSet((newValue, oldValue, isReset) => {
                                StateSynchronizer.getInstance().notify(variable.uid, newValue, oldValue, isReset);
                            });

                            return () => unsub();
                        },
                    ],
                    key: variable.uid,
                })
            );
        }

        family = atomFamilyRegistry.get(variable.uid);
        const extrasSerializable = new RequestExtrasSerializable(extras);
        atomInstance = family(extrasSerializable);

        // Register the atom instance in the atomFamilyMembersRegistry so we can retrieve it later
        if (!atomFamilyMembersRegistry.has(family)) {
            atomFamilyMembersRegistry.set(family, new Map());
        }
        atomFamilyMembersRegistry.get(family).set(extrasSerializable.toJSON(), atomInstance);
    } else {
        // otherwise register it as a plain atom
        if (!atomRegistry.has(variable.uid)) {
            let defaultValue = variable.default;
            const persistValue = variable.persist_value || isEmbedded();

            // If persist_value flag is set, try to retrieve persisted value and use it if we found one instead of default
            if (persistValue) {
                const persistedValue = localStorage.getItem(getSessionKey(extras, variable.uid));

                if (persistedValue) {
                    defaultValue = JSON.parse(persistedValue);
                }
            }

            atomRegistry.set(
                variable.uid,
                atom({
                    default: defaultValue,
                    // If persist_value flag is set, register an effect which updates the selected value in sessionStorage on each variable update
                    effects: persistValue
                        ? [
                              ({ onSet }) => {
                                  onSet((newValue) => {
                                      localStorage.setItem(
                                          getSessionKey(extras, variable.uid),
                                          JSON.stringify(newValue)
                                      );
                                  });
                              },
                          ]
                        : [],
                    key: variable.uid,
                })
            );
        }

        atomInstance = atomRegistry.get(variable.uid);
    }

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
                        (extrasSerializable: RequestExtrasSerializable) =>
                        ({ get }) => {
                            const variableValue = get(family ? family(extrasSerializable) : atomInstance);

                            return resolveNested(
                                variableValue,
                                variable.nested.map((n) => String(n))
                            );
                        },
                    key,
                    set:
                        (extrasSerializable: RequestExtrasSerializable) =>
                        ({ set }, newValue) => {
                            set(family ? family(extrasSerializable) : atomInstance, (v) =>
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
        const extrasSerializable = new RequestExtrasSerializable(extras);

        // We cast it since it's a writeable selector
        return selectorFamilyInstance(extrasSerializable) as RecoilState<T>;
    }

    return atomInstance;
}
