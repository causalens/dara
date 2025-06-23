import { ConditionOperator } from '@/types';

/**
 * This function takes the operator and both values and performs the appropriate comparison between the two and returns
 * the result
 *
 * @param operator the operator defined in the condition
 * @param value the value on the lhs of the condition
 * @param other the value on the rhs of the condition
 */
export function isConditionTrue(operator: ConditionOperator, value: any, other: any): boolean {
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
