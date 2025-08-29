import { type AtomEffect, type RecoilState, type Snapshot, atomFamily, selectorFamily } from 'recoil';

import { type WebSocketClientInterface } from '@/api';
import { type RequestExtras, RequestExtrasSerializable } from '@/api/http';
import { isEmbedded } from '@/shared/utils/embed';
import { type DerivedVariable, type GlobalTaskContext, type SingleVariable, isDerivedVariable } from '@/types';

// eslint-disable-next-line import/no-cycle
import { STORES, getEffect, getOrRegisterDerivedVariableValue, resolveNested, setNested } from './internal';
import { StateSynchronizer } from './state-synchronizer';
import { atomFamilyMembersRegistry, atomFamilyRegistry, getRegistryKey, selectorFamilyRegistry } from './store';

const STATE_SYNCHRONIZER = new StateSynchronizer();

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
                        if (!STATE_SYNCHRONIZER.isRegistered(variable.uid)) {
                            STATE_SYNCHRONIZER.register(variable.uid, variable.default);
                        } else {
                            const currentState = STATE_SYNCHRONIZER.getCurrentState(variable.uid);

                            if (!isDefaultDerived || currentState?.type !== 'initial') {
                                // Otherwise synchronize the initial value,
                                // unless the default is a DerivedVariable and the current state is initial
                                // because in that case the default will be linked to the selector which needs to be resolved
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

                    const effects: AtomEffect<T>[] = [familySync];

                    const storeEffect = getEffect(variable);
                    if (storeEffect) {
                        effects.push(storeEffect(variable, extrasSerializable, wsClient, taskContext));
                    } else if (isEmbedded()) {
                        // In this case BrowserStore doesn't require an explicit store in the Variable form
                        // so it's safe to cast to any
                        effects.push(
                            STORES.BrowserStore.effect(
                                variable as SingleVariable<T, any>,
                                extrasSerializable,
                                wsClient,
                                taskContext
                            )
                        );
                    }

                    return effects;
                },
                key: variable.uid,
            })
        );
    }

    const family = atomFamilyRegistry.get(variable.uid)!;
    const extrasSerializable = new RequestExtrasSerializable(extras);
    const atomInstance: RecoilState<T> = family(extrasSerializable);

    // Register the atom instance in the atomFamilyMembersRegistry so we can retrieve it later
    if (!atomFamilyMembersRegistry.has(family)) {
        atomFamilyMembersRegistry.set(family, new Map());
    }
    atomFamilyMembersRegistry.get(family)!.set(extrasSerializable.toJSON(), atomInstance);

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
        const selectorFamilyInstance = selectorFamilyRegistry.get(key)!;

        // We cast it since it's a writeable selector
        return selectorFamilyInstance(extrasSerializable) as RecoilState<T>;
    }

    return atomInstance;
}

export function resolvePlainVariableStatic(variable: SingleVariable<any>, snapshot: Snapshot): RecoilState<any> {
    const family = atomFamilyRegistry.get(variable.uid);

    if (family) {
        const extrasSerializable = new RequestExtrasSerializable({});
        const atomInstance: RecoilState<any> = family(extrasSerializable);
        const atomValue = snapshot.getLoadable(atomInstance).valueMaybe();
        // TODO: ensure it's not default=dv?
        if (atomValue !== null && !(atomValue instanceof Promise)) {
            return atomInstance;
        }
    }

    return variable.default;
}
