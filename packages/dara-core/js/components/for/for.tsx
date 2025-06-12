import copy from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import * as React from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { type ListChildComponentProps, type ListItemKeySelector, VariableSizeList } from 'react-window';

import { DynamicComponent, useAnyVariable } from '@/shared';
import { FallbackCtx } from '@/shared/context';
import { useFallbackCtx } from '@/shared/context/fallback-context';
import { resolveNested } from '@/shared/interactivity/nested';

import { type AnyVariable, type ComponentInstance } from '../../types/core';
import { type Marker, applyMarkers, getInjectionMarkers } from './templating';

interface VirtualizationConfig {
    size: string | number | null;
    direction: 'vertical' | 'horizontal';
}

interface ForProps {
    items: AnyVariable<Array<any>>;
    renderer: ComponentInstance;
    key_accessor: string | null;
    virtualization: VirtualizationConfig | null;
}

/**
 * Merged item data for the VariableSizeList
 */
interface ItemData {
    items: any[];
    renderer: ComponentInstance;
    markers: Marker[];
    getItemKey: ListItemKeySelector<ItemData>;
}

const createItemData = (
    items: any[],
    renderer: ComponentInstance,
    markers: Marker[],
    getItemKey: ListItemKeySelector<ItemData>
): ItemData => ({
    items,
    renderer,
    markers,
    getItemKey,
});

/**
 * Memoized child that applies the precomputed loop variable paths to the renderer,
 * for the given loop item.
 */
const ForChild = React.memo((props: ListChildComponentProps<ItemData>): React.ReactNode => {
    const transformedRenderer = React.useMemo(() => {
        let component;

        try {
            component = applyMarkers(
                props.data.renderer,
                props.data.markers,
                props.data.items[props.index],
                props.data.getItemKey(props.index, props.data)
            );
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to apply markers', e);
            component = copy(props.data.renderer);
        }

        // IMPORTANT: apply style passed through from e.g. the VariableSizeList, which positions it correctly
        component.props.style = { ...component.props.style, ...props.style };
        return component;
    }, [props.data, props.index, props.style]);

    return <DynamicComponent component={transformedRenderer} />;
}, isEqual);

function ForImpl(props: ForProps & { suspend: number | boolean }): React.ReactNode {
    const items = useAnyVariable(props.items);
    const markers = React.useMemo(() => getInjectionMarkers(props.renderer), [props.renderer]);
    const key = React.useMemo(() => props.key_accessor?.split('.') ?? null, [props.key_accessor]);

    const getItemKey = React.useCallback<ListItemKeySelector<ItemData>>(
        (index, data) => (key ? resolveNested(data.items[index], key) : index),
        [key]
    );

    const itemData = React.useMemo(
        () => createItemData(items, props.renderer, markers, getItemKey),
        [items, props.renderer, markers, getItemKey]
    );

    const getItemSize = React.useCallback(
        (index: number) => {
            // assuming virtualization is not null here
            if (typeof props.virtualization!.size === 'string') {
                return items[index][props.virtualization!.size];
            }

            return props.virtualization!.size;
        },
        [props.virtualization, items]
    );

    if (props.virtualization === null) {
        // reapply the parent suspend setting
        return (
            <FallbackCtx.Provider value={{ suspend: props.suspend }}>
                {items.map((_, index) => (
                    <ForChild key={getItemKey(index, itemData)} data={itemData} index={index} style={{}} />
                ))}
            </FallbackCtx.Provider>
        );
    }

    return (
        <FallbackCtx.Provider value={{ suspend: props.suspend }}>
            <AutoSizer>
                {({ width, height }) => (
                    <VariableSizeList<ItemData>
                        height={height}
                        width={width}
                        itemCount={items.length}
                        itemData={itemData}
                        itemKey={getItemKey}
                        itemSize={getItemSize}
                        layout={props.virtualization!.direction}
                    >
                        {ForChild}
                    </VariableSizeList>
                )}
            </AutoSizer>
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
