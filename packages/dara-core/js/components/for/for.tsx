import isEqual from 'lodash/isEqual';
import * as React from 'react';

import { DynamicComponent, useAnyVariable } from '@/shared';
import { FallbackCtx } from '@/shared/context';
import { useFallbackCtx } from '@/shared/context/fallback-context';
import { resolveNested } from '@/shared/interactivity/nested';

import { type AnyVariable, type ComponentInstance } from '../../types/core';
import { type Marker, applyMarkers, getInjectionMarkers } from './templating';

interface ForProps {
    items: AnyVariable<Array<any>>;
    renderer: ComponentInstance;
    key_accessor: string | null;
}

/**
 * Memoized child that applies the precomputed loop variable paths to the renderer,
 * for the given loop item.
 */
const ForChild = React.memo(
    (props: {
        renderer: ComponentInstance;
        itemKey: string | number;
        item: any;
        markers: Marker[];
    }): React.ReactNode => {
        const transformedRenderer = React.useMemo(() => {
            return applyMarkers(props.renderer, props.markers, props.item, props.itemKey);
        }, [props.renderer, props.markers, props.item, props.itemKey]);

        return <DynamicComponent component={transformedRenderer} />;
    },
    isEqual
);

function ForImpl(props: ForProps & { suspend: number | boolean }): React.ReactNode {
    const items = useAnyVariable(props.items);
    const markers = React.useMemo(() => getInjectionMarkers(props.renderer), [props.renderer]);
    const key = React.useMemo(() => props.key_accessor?.split('.') ?? null, [props.key_accessor]);

    // reapply the parent suspend setting
    return (
        <FallbackCtx.Provider value={{ suspend: props.suspend }}>
            {items.map((item, index) => (
                <ForChild
                    key={key ? resolveNested(item, key) : index}
                    itemKey={key ? resolveNested(item, key) : index}
                    item={item}
                    markers={markers}
                    renderer={props.renderer}
                />
            ))}
        </FallbackCtx.Provider>
    );
}

function For(props: ForProps): React.ReactNode {
    const { suspend } = useFallbackCtx();

    // Force disable suspend, as that defeats the purpose of this component.
    return (
        <FallbackCtx.Provider value={{ suspend: false }}>
            <ForImpl {...props} suspend={suspend} />
        </FallbackCtx.Provider>
    );
}

export default For;
