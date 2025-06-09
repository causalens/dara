import isEqual from 'lodash/isEqual';
import * as React from 'react';

import { DynamicComponent, useAnyVariable } from '@/shared';
import { FallbackCtx } from '@/shared/context';
import { resolveNested } from '@/shared/interactivity/nested';

import { AnyVariable, ComponentInstance } from '../../types/core';
import { LoopVarPath, getLoopVarPaths, injectLoopVar } from './templating';

interface ForProps {
    items: AnyVariable<Array<any>>;
    renderer: ComponentInstance;
    key: string | null;
}

/**
 * Memoized child that applies the precomputed loop variable paths to the renderer,
 * for the given loop item.
 */
const ForChild = React.memo(
    (props: { renderer: ComponentInstance; item: any; loopVarPaths: LoopVarPath[] }): React.ReactNode => {
        const transformedRenderer = React.useMemo(
            () => injectLoopVar(props.renderer, props.loopVarPaths, props.item),
            [props.renderer, props.loopVarPaths, props.item]
        );

        return <DynamicComponent component={transformedRenderer} />;
    },
    isEqual
);

function ForImpl(props: ForProps & { suspend: number | boolean }): React.ReactNode {
    const items = useAnyVariable(props.items);
    const loopVarPaths = React.useMemo(() => getLoopVarPaths(props.renderer), [props.renderer]);
    const key = React.useMemo(() => props.key?.split('.') ?? null, [props.key]);

    // reapply the parent suspend setting
    return (
        <FallbackCtx.Provider value={{ suspend: props.suspend }}>
            {items.map((item, index) => (
                <ForChild
                    key={key ? resolveNested(item, key) : index}
                    item={item}
                    loopVarPaths={loopVarPaths}
                    renderer={props.renderer}
                />
            ))}
        </FallbackCtx.Provider>
    );
}

function For(props: ForProps): React.ReactNode {
    const { suspend } = React.useContext(FallbackCtx);

    // Force disable suspend, as that defeats the purpose of this component.
    return (
        <FallbackCtx.Provider value={{ suspend: false }}>
            <ForImpl {...props} suspend={suspend} />
        </FallbackCtx.Provider>
    );
}

export default For;
