import { describe, expect, it } from 'vitest';

import { getVariableHookSignature } from '@/shared/utils/variable-hook-signature';
import {
    type Condition,
    ConditionOperator,
    type DerivedVariable,
    type SingleVariable,
    type SwitchVariable,
} from '@/types';

function singleVariable(uid: string, defaultValue: any = `${uid}-default`): SingleVariable<any> {
    return {
        __typename: 'Variable',
        default: defaultValue,
        nested: [],
        uid,
    };
}

function derivedVariable(uid: string, overrides: Partial<DerivedVariable> = {}): DerivedVariable {
    return {
        __typename: 'DerivedVariable',
        deps: [],
        nested: [],
        uid,
        variables: [],
        ...overrides,
    };
}

function switchVariable(uid: string, overrides: Partial<SwitchVariable<any>> = {}): SwitchVariable<any> {
    return {
        __typename: 'SwitchVariable',
        default: 'fallback',
        uid,
        value: 'selected',
        value_map: {
            selected: 'target',
        },
        ...overrides,
    };
}

function condition(variable: Condition<any>['variable'], other: unknown): Condition<any> {
    return {
        __typename: 'Condition',
        operator: ConditionOperator.EQUAL,
        other,
        variable,
    };
}

function getParamHookKey(params: Record<string, unknown>): string {
    if (Object.keys(params).length === 0) {
        return 'no-param-hooks';
    }

    return JSON.stringify(Object.entries(params).map(([key, value]) => [key, getVariableHookSignature(value)]));
}

describe('getVariableHookSignature', () => {
    it('collapses literal values to one hook signature', () => {
        expect(getVariableHookSignature('page-a')).toEqual(getVariableHookSignature('page-b'));
        expect(getVariableHookSignature({ page: 'a' })).toEqual(getVariableHookSignature({ page: 'b' }));
        expect(getParamHookKey({ slug: 'run-history' })).toEqual(getParamHookKey({ slug: 'details' }));
    });

    it('distinguishes variable hook branches and variable identities', () => {
        expect(getVariableHookSignature(singleVariable('selected-page', 'run-history'))).toEqual(
            getVariableHookSignature(singleVariable('selected-page', 'details'))
        );
        expect(getVariableHookSignature(singleVariable('page-a'))).not.toEqual(
            getVariableHookSignature(singleVariable('page-b'))
        );
        expect(getVariableHookSignature(singleVariable('selected-page'))).not.toEqual(
            getVariableHookSignature(singleVariable('selected-page', derivedVariable('derived-default')))
        );
        expect(getVariableHookSignature(derivedVariable('delayed', { polling_interval: 500 }))).toEqual(
            getVariableHookSignature(derivedVariable('delayed', { polling_interval: 1000 }))
        );
        expect(
            getVariableHookSignature(derivedVariable('delayed', { polling_interval: singleVariable('poll') }))
        ).not.toEqual(getVariableHookSignature(derivedVariable('delayed', { polling_interval: null })));
    });

    it('captures nested condition and switch variable hook structure', () => {
        const selectedPage = singleVariable('selected-page');
        const defaultPage = singleVariable('default-page');

        const switchWithLiteralConditionOther = switchVariable('next-page', {
            default: defaultPage,
            value: condition(selectedPage, 'run-history'),
        });
        const switchWithChangedLiteralConditionOther = switchVariable('next-page', {
            default: defaultPage,
            value: condition(selectedPage, 'details'),
            value_map: {
                details: 'other-target',
            },
        });
        const switchWithVariableConditionOther = switchVariable('next-page', {
            default: defaultPage,
            value: condition(selectedPage, singleVariable('selected-other')),
        });
        const switchWithVariableMap = switchVariable('next-page', {
            default: defaultPage,
            value: condition(selectedPage, 'run-history'),
            value_map: singleVariable('page-map'),
        });

        expect(getVariableHookSignature(switchWithLiteralConditionOther)).toEqual(
            getVariableHookSignature(switchWithChangedLiteralConditionOther)
        );
        expect(getVariableHookSignature(switchWithLiteralConditionOther)).not.toEqual(
            getVariableHookSignature(switchWithVariableConditionOther)
        );
        expect(getVariableHookSignature(switchWithLiteralConditionOther)).not.toEqual(
            getVariableHookSignature(switchWithVariableMap)
        );
    });

    it('represents Link param hook order and nesting', () => {
        const selectedPage = singleVariable('selected-page');
        const plainParam = singleVariable('plain-param');
        const derivedParam = derivedVariable('derived-param', {
            variables: [selectedPage],
        });
        const switchParam = switchVariable('switch-param', {
            value: selectedPage,
        });

        expect(getParamHookKey({ slug: 'run-history' })).toEqual(getParamHookKey({ slug: 'details' }));
        expect(getParamHookKey({ slug: plainParam })).not.toEqual(getParamHookKey({ slug: selectedPage }));
        expect(getParamHookKey({ first: 'literal', second: plainParam })).not.toEqual(
            getParamHookKey({ first: plainParam, second: 'literal' })
        );
        expect(getParamHookKey({ first: plainParam, second: derivedParam })).not.toEqual(
            getParamHookKey({ first: plainParam, second: switchParam })
        );
    });

    it('does not recursively expand cyclic variable graphs', () => {
        const cyclic = switchVariable('cyclic');
        cyclic.default = cyclic;

        expect(getVariableHookSignature(cyclic)).toEqual([
            'SwitchVariable',
            'cyclic',
            'literal',
            'literal',
            'SwitchVariable:cyclic:seen',
        ]);
    });
});
