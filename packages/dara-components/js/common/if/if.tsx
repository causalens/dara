import { useMemo } from 'react';

import {
    ComponentInstance,
    Condition,
    DynamicComponent,
    StyledComponentProps,
    isConditionTrue,
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
    }, [conditionResult, props.false_children, props.true_children]);

    return (
        <>
            {children.map((child, idx) => (
                <DynamicComponent component={child} key={`if-${idx}-${child.name}-${String(conditionResult)}`} />
            ))}
        </>
    );
}

export default If;
