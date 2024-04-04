/* eslint-disable react-hooks/exhaustive-deps */
import * as React from 'react';

import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import { ComponentInstance } from '@/types';

/**
 * Merge a list of context component definitions into a single component definition
 * [component1, component2, component3] => component1(component2(component3(children)))

 * @param contextComponents List of context components to merge
 * @param children Children to pass to the innermost component
 */
function mergeContext(contextComponents: Array<ComponentInstance>, children: React.ReactNode): ComponentInstance {
    const [component, ...rest] = contextComponents;

    return {
        ...component,
        props: {
            ...component.props,
            children: rest.length === 0 ? children : <DynamicComponent component={mergeContext(rest, children)} />,
        },
    };
}

interface DynamicContextProps {
    children: React.ReactNode;
    contextComponents: Array<ComponentInstance>;
}

function DynamicContext(props: DynamicContextProps): JSX.Element {
    const mergedContext = React.useMemo(() => {
        if (props.contextComponents.length === 0) {
            return null;
        }

        return mergeContext(props.contextComponents, props.children);
    }, [props.contextComponents]);

    if (!mergedContext) {
        return <>{props.children}</>;
    }

    return <DynamicComponent component={mergedContext} />;
}

export default DynamicContext;
