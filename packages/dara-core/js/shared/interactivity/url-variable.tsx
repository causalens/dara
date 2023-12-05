import { mixed } from '@recoiljs/refine';
import { RecoilState, atom, useRecoilState } from 'recoil';
import { urlSyncEffect } from 'recoil-sync';

import { UrlVariable } from '@/types';

import { atomRegistry } from './store';

/**
 * Get a URL variable from the atom registry, registering it if not already registered
 * TODO: once persist_value is unified with url sync, this can be moved into the same function as getOrRegisterPlainVariable
 *
 * @param variable variable to register
 * @param searchString URL search string
 */
export function getOrRegisterUrlVariable<T>(variable: UrlVariable<T>): RecoilState<T> {
    if (!atomRegistry.has(variable.uid)) {
        atomRegistry.set(
            variable.uid,
            atom({
                default: variable.default,
                effects: [
                    urlSyncEffect({ history: 'push', itemKey: variable.query, refine: mixed(), syncDefault: true }),
                ],
                key: variable.uid,
            })
        );
    }
    return atomRegistry.get(variable.uid);
}

export function useUrlVariable<T>(variable: UrlVariable<T>): [T, (value: T) => void] {
    return useRecoilState<T>(getOrRegisterUrlVariable(variable));
}
