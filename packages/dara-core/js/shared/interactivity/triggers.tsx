import { type RecoilState, type Snapshot, atom, useRecoilValue } from 'recoil';

import { type DerivedVariable, isDerivedVariable } from '@/types';

import { type TriggerIndexValue, atomRegistry, getRegistryKey } from './store';

/**
 * Information about a trigger in the variable tree
 */
export interface TriggerInfo {
    /** Path to the variable that owns this trigger */
    path: string[];
    /** The variable that owns this trigger */
    variable: DerivedVariable;
}

/**
 * Get a trigger index for a variable from the atom registry, registering it if not already registered
 *
 * @param variable variable to register trigger for
 */
export function getOrRegisterTrigger(variable: DerivedVariable): RecoilState<TriggerIndexValue> {
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
 * Resolve current trigger index value for a variable from the atom registry.
 * If the atom is not registered, returns default values.
 */
export function resolveTriggerStatic(
    triggerAtom: RecoilState<TriggerIndexValue> | null,
    snapshot: Snapshot
): TriggerIndexValue {
    if (!triggerAtom) {
        return {
            force_key: null,
            inc: 0,
        };
    }
    return snapshot.getLoadable(triggerAtom).valueOrThrow();
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
            if (isDerivedVariable(variable)) {
                const varPath = [...path, String(idx)];
                // register trigger itself
                triggers.push({
                    path: varPath,
                    variable,
                });

                // register triggers for nested variables
                // NOTE: path will be values since we map into ResolvedXVariables
                walk(variable.variables, [...varPath, 'values']);
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
 * @param registerFunc register function to run
 * @param triggerMap optional pre-built trigger map for efficiency
 */
export function registerChildTriggers(
    triggerList: Array<TriggerInfo>,
    registerFunc: (state: RecoilState<any>) => TriggerIndexValue
): Array<TriggerIndexValue> {
    return triggerList.map((triggerInfo) => {
        if (isDerivedVariable(triggerInfo.variable)) {
            const triggerIndex = getOrRegisterTrigger(triggerInfo.variable);
            return registerFunc(triggerIndex);
        }
        throw new Error('Invalid trigger variable type');
    });
}
