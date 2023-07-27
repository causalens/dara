import { RecoilState, atom, selector } from 'recoil';

import { WebSocketClientInterface } from '@/api';
import { GlobalTaskContext } from '@/shared/context/global-task-context';
import { isEmbedded } from '@/shared/utils/embed';
import { SingleVariable, isDerivedVariable } from '@/types';

// eslint-disable-next-line import/no-cycle
import { getOrRegisterDerivedVariableValue, resolveNested, setNested } from './internal';
import { atomRegistry, getRegistryKey, selectorRegistry } from './store';

/**
 * Get the session key used to persist a variable value
 *
 * @param sessionToken current session token
 * @param uid uid of the variable to persist
 */
export function getSessionKey(sessionToken: string, uid: string): string {
    // If we're within an IFrame (Jupyter)
    if (isEmbedded()) {
        return `dara-session-${(window.frameElement as HTMLIFrameElement).dataset.daraPageId}-var-${uid}`;
    }

    return `dara-session-${sessionToken}-var-${uid}`;
}

/**
 * Get a plain variable from the atom or selector registry (based on nested property),
 * registering it if not already registered
 *
 * @param variable variable to register
 * @param wsClient websocket client
 * @param taskContext task context
 * @param search search query
 * @param token current session token
 */
export function getOrRegisterPlainVariable<T>(
    variable: SingleVariable<T>,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    search: string,
    token: string
): RecoilState<T> {
    const isNested = variable.nested && variable.nested.length > 0;

    if (!atomRegistry.has(variable.uid)) {
        let defaultValue = variable.default;
        // Variables created from DVs cannot be persisted
        const persistValue = (variable.persist_value || isEmbedded()) && !isDerivedVariable(variable.default);

        // If persist_value flag is set, try to retrieve persisted value and use it if we found one instead of default
        if (persistValue) {
            const persistedValue = localStorage.getItem(getSessionKey(token, variable.uid));

            if (persistedValue) {
                defaultValue = JSON.parse(persistedValue);
            }
        }

        atomRegistry.set(
            variable.uid,
            atom({
                /*
            If created from a DerivedVariable, link the default state to that DV's selector
            From Recoil docs:
            "If a selector is used as the default the atom will dynamically update as the default selector updates.
            Once the atom is set, then it will retain that value unless the atom is reset."
            */
                default: isDerivedVariable(variable.default)
                    ? getOrRegisterDerivedVariableValue(variable.default, wsClient, taskContext, search, token)
                    : defaultValue,
                effects: [
                    ({ onSet }) => {
                        // If persist_value flag is set, register an effect which updates the selected value in sessionStorage on each variable update
                        if (persistValue) {
                            onSet((newValue) => {
                                localStorage.setItem(getSessionKey(token, variable.uid), JSON.stringify(newValue));
                            });
                        }
                    },
                ],
                key: variable.uid,
            })
        );
    }

    // In case of a nested variable, register a selector
    if (isNested) {
        const key = getRegistryKey(variable, 'selector');

        if (!selectorRegistry.has(key)) {
            // Below we make sure nested is a list of strings
            // this is validated on the Python side but when using @template we can't validate it and is replaced at runtime
            // so we coerce it to a list of strings here
            selectorRegistry.set(
                key,
                selector<any>({
                    get: ({ get }) => {
                        const variableValue = get(atomRegistry.get(variable.uid));

                        return resolveNested(
                            variableValue,
                            variable.nested.map((n) => String(n))
                        );
                    },
                    key,
                    set: ({ set }, newValue) => {
                        set(atomRegistry.get(variable.uid), (v) =>
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

        // We cast it since it's a writeable selector
        return selectorRegistry.get(key) as RecoilState<T>;
    }

    return atomRegistry.get(variable.uid);
}
