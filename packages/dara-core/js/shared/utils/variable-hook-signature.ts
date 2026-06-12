import { isCondition, isDerivedVariable, isVariable } from '@/types';

export type VariableHookSignature = string | Array<VariableHookSignature>;

/**
 * Build a stable signature for the hook structure used to resolve a value through useVariable/useConditionOrVariable.
 *
 * Literal values intentionally collapse to the same signature. Variable values include their kind and uid because
 * useVariable performs variable subscription bookkeeping by uid in addition to selecting a hook branch by kind.
 */
export function getVariableHookSignature(value: unknown, seenVariables = new Set<string>()): VariableHookSignature {
    if (isCondition(value)) {
        return [
            'Condition',
            getVariableHookSignature(value.variable, seenVariables),
            getVariableHookSignature(value.other, seenVariables),
        ];
    }

    if (!isVariable(value)) {
        return 'literal';
    }

    const variableKey = `${value.__typename}:${value.uid}`;
    if (seenVariables.has(variableKey)) {
        return `${variableKey}:seen`;
    }

    const nextSeenVariables = new Set(seenVariables);
    nextSeenVariables.add(variableKey);

    switch (value.__typename) {
        case 'Variable':
            return ['Variable', value.uid, isDerivedVariable(value.default) ? 'derived-default' : 'literal-default'];
        case 'DerivedVariable':
            return [
                'DerivedVariable',
                value.uid,
                getVariableHookSignature(value.polling_interval ?? null, nextSeenVariables),
            ];
        case 'SwitchVariable':
            return [
                'SwitchVariable',
                value.uid,
                getVariableHookSignature(value.value, nextSeenVariables),
                getVariableHookSignature(value.value_map, nextSeenVariables),
                getVariableHookSignature(value.default, nextSeenVariables),
            ];
        case 'StateVariable':
            return [
                'StateVariable',
                value.uid,
                value.property_name,
                getVariableHookSignature(value.parent_variable, nextSeenVariables),
            ];
        case 'ServerVariable':
            return ['ServerVariable', value.uid];
        case 'StreamVariable':
            return ['StreamVariable', value.uid];
        default:
            return variableKey;
    }
}
