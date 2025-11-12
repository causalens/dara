import { useMemo } from 'react';

import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import { useVariable } from '@/shared/interactivity';
import type { BaseComponentProps, ComponentInstance, Variable } from '@/types';

interface MatchProps extends BaseComponentProps {
    value: Variable<any>;
    when: Record<string | number, ComponentInstance | null>;
    default: ComponentInstance | null;
}

/**
 * The Match component allows the children to be rendered based on a value, at runtime in the JS code.
 */
function Match(props: MatchProps): React.ReactNode {
    const [value] = useVariable(props.value, { suspend: false });

    const component = useMemo(() => {
        if (value in props.when) {
            return props.when[value];
        }

        return props.default;
    }, [value, props.when, props.default]);

    if (!component) {
        return null;
    }

    return <DynamicComponent component={component} />;
}

export default Match;
