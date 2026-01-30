/**
 * Find Stream Variables
 *
 * Recursively walks a variable's dependency tree to find all StreamVariables.
 * Used for tracking stream usage when components mount/unmount.
 */

import {
    type AnyVariable,
    type StreamVariable,
    isCondition,
    isDerivedVariable,
    isStateVariable,
    isStreamVariable,
    isSwitchVariable,
    isVariable,
} from '@/types';

/**
 * Recursively find all StreamVariables in a variable's dependency tree.
 *
 * Handles all variable types:
 * - DerivedVariable: walks `variables` array
 * - SwitchVariable: walks `value`, `value_map`, `default`
 * - StateVariable: walks `parent_variable`
 * - SingleVariable: walks `default` (can be DerivedVariable via create_from_derived)
 * - StreamVariable: collects it and walks its `variables` array
 *
 * @param variable The variable to search
 * @returns Array of all StreamVariables found in the dependency tree
 */
export function findStreamVariables(variable: AnyVariable<unknown>): StreamVariable[] {
    const streams: StreamVariable[] = [];
    const visited = new Set<string>();

    function walk(v: unknown): void {
        if (!isVariable(v)) {
            return;
        }

        // Prevent infinite loops from circular dependencies
        if (visited.has(v.uid)) {
            return;
        }
        visited.add(v.uid);

        if (isStreamVariable(v)) {
            streams.push(v);
            // Also walk stream's own dependencies (stream can depend on other variables)
            if (v.variables && Array.isArray(v.variables)) {
                v.variables.forEach(walk);
            }
            return;
        }

        if (isDerivedVariable(v)) {
            if (v.variables && Array.isArray(v.variables)) {
                v.variables.forEach(walk);
            }
            return;
        }

        if (isSwitchVariable(v)) {
            // value can be Variable or Condition (which has .variable)
            if (isVariable(v.value)) {
                walk(v.value);
            } else if (isCondition(v.value)) {
                walk(v.value.variable);
            }
            // value_map is Record<string, Variable> - walk all values
            if (v.value_map && typeof v.value_map === 'object') {
                Object.values(v.value_map).forEach(walk);
            }
            if (isVariable(v.default)) {
                walk(v.default);
            }
            return;
        }

        if (isStateVariable(v)) {
            walk(v.parent_variable);
            return;
        }

        // SingleVariable (plain variable) - default can be DerivedVariable
        if ('default' in v && isVariable(v.default)) {
            walk(v.default);
        }
    }

    walk(variable);
    return streams;
}

/**
 * Find all StreamVariables in an array of variables.
 *
 * @param variables Array of variables to search
 * @returns Array of all unique StreamVariables found
 */
export function findStreamVariablesInArray(variables: Array<AnyVariable<unknown> | unknown>): StreamVariable[] {
    const allStreams: StreamVariable[] = [];
    const seenUids = new Set<string>();

    for (const v of variables) {
        if (isVariable(v)) {
            const streams = findStreamVariables(v);
            for (const stream of streams) {
                if (!seenUids.has(stream.uid)) {
                    seenUids.add(stream.uid);
                    allStreams.push(stream);
                }
            }
        }
    }

    return allStreams;
}
