/* eslint-disable react-hooks/exhaustive-deps */

import { useMemo } from 'react';

import {
    ComponentInstance,
    Condition,
    ConditionOperator,
    DynamicComponent,
    StyledComponentProps,
    useAnyVariable,
} from '@darajs/core';

interface IfProps extends StyledComponentProps {
    /** The condition def to evaluate */
    condition: Condition<any>;
    /** Children to render if the condition is false */
    false_children: Array<ComponentInstance>;
    /** Children to render if the condition is true */
    true_children: Array<ComponentInstance>;
}

/**
 * This function takes the operator and both values and performs the appropriate comparison between the two and returns
 * the result
 *
 * @param operator the operator defined in the condition
 * @param value the value on the lhs of the condition
 * @param other the value on the rhs of the condition
 */
export function isConditionTrue(operator: ConditionOperator, value: unknown, other: unknown): boolean {
    if (operator === ConditionOperator.EQUAL) {
        return value === other;
    }
    if (operator === ConditionOperator.NOT_EQUAL) {
        return value !== other;
    }
    if (operator === ConditionOperator.GREATER_EQUAL) {
        return value >= other;
    }
    if (operator === ConditionOperator.GREATER_THAN) {
        return value > other;
    }
    if (operator === ConditionOperator.LESS_EQUAL) {
        return value <= other;
    }
    if (operator === ConditionOperator.LESS_THAN) {
        return value < other;
    }
    if (operator === ConditionOperator.TRUTHY) {
        return !!value;
    }
    throw new Error(`Unexpected operator ${String(operator)} passed to conditional (If) component`);
}

/**
 * The if component conditionally renders either the falsey or truthy children depending on the evaluation of the
 * condition def object, with the values pulled from the recoil state
 *
 * @param props the component props
 */
function If(props: IfProps): JSX.Element {
    const value = useAnyVariable(props.condition.variable);
    const other = useAnyVariable(props.condition.other);

    const conditionResult = useMemo(
        () => isConditionTrue(props.condition.operator, value, other),
        [props.condition, value, other]
    );
    const children = useMemo(() => {
        return conditionResult ? props.true_children : props.false_children;
    }, [conditionResult]);

    return (
        <>
            {children.map((child, idx) => (
                <DynamicComponent component={child} key={`if-${idx}-${child.name}-${String(conditionResult)}`} />
            ))}
        </>
    );
}

export default If;
