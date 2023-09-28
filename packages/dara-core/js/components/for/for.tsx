/* eslint-disable react-hooks/exhaustive-deps */

import { CSSProperties, useCallback, useMemo } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { ListChildComponentProps, VariableSizeList } from 'react-window';

import { DynamicComponent, getMarkerPaths, replaceMarkers, useAnyVariable } from '@/shared';
import { AnyVariable, ComponentInstance, StyledComponentProps, TemplatedComponentInstance } from '@/types';

interface ForProps extends StyledComponentProps {
    /**
     * The data to render the component for.
     */
    data: AnyVariable<Array<Record<string, any>>>;
    /**
     * The direction of the list.
     */
    direction: 'horizontal' | 'vertical';
    /**
     * The key accessor to use for a unique key for each item in the list.
     */
    key_accessor: string;
    /**
     * The size accessor to use for the size of each item in the list.
     */
    size_accessor: string;
    /**
     * The template to render for each item in the list.
     */
    template: ComponentInstance & TemplatedComponentInstance;
    /**
     * Whether to virtualise the list.
     */
    virtualize: boolean;
}

interface ForChildProps {
    /**
     * The data to render the component for.
     */
    data: Record<string, any>;
    /**
     * Precomputed paths to the markers in the template.
     */
    markerPaths: Record<string, string>;
    /**
     * The style to apply to the component.
     */
    style?: CSSProperties;
    /**
     * The template to render for each item in the list.
     */
    template: ComponentInstance & TemplatedComponentInstance;
}

/**
 * The ForChild component is used to render a single component based on variable data.
 * It utilises a templated component to render the component, replacing markers with the data for that item.
 */
function ForChild(props: ForChildProps): JSX.Element {
    const component = useMemo(() => {
        const withoutMarkers = replaceMarkers(props.template, props.data, props.markerPaths);
        withoutMarkers.props.style = props.style;
        return withoutMarkers;
    }, [props.template, props.data]);

    return <DynamicComponent component={component} />;
}

/**
 * The For component is used to render a list of components based on variable data.
 * It utilises a templated component to render each item in the list, precomputing the paths to the markers in the template
 * and passing them to the ForChild component for replacement.
 */
function For(props: ForProps): JSX.Element {
    const data = useAnyVariable(props.data);

    // Precomputed paths to markers in the template, so we don't have to recompute them on every render for each item
    const markerPaths = useMemo(() => getMarkerPaths(props.template), [props.template]);

    const ListChild = useCallback(
        (listProps: ListChildComponentProps<Record<string, any>>) => {
            return (
                <ForChild
                    data={listProps.data[listProps.index]}
                    key={listProps.data[listProps.index][props.key_accessor]}
                    markerPaths={markerPaths}
                    style={listProps.style}
                    template={props.template}
                />
            );
        },
        [markerPaths, props.key_accessor]
    );

    const getItemSize = useCallback(
        (index: number) => {
            return data[index][props.size_accessor];
        },
        [data, props.size_accessor]
    );

    const getItemKey = useCallback(
        (index: number, listData: Record<string, any>) => {
            return listData[index][props.key_accessor];
        },
        [props.key_accessor]
    );

    // If we're not virtualising, just render the list normally
    if (!props.virtualize) {
        return (
            <>
                {data.map((item, index) => (
                    <ListChild data={data} index={index} key={item[props.key_accessor]} style={{}} />
                ))}
            </>
        );
    }

    return (
        <AutoSizer>
            {({ height, width }) => (
                <VariableSizeList
                    height={height}
                    itemCount={data.length}
                    itemData={data}
                    itemKey={getItemKey}
                    itemSize={getItemSize}
                    layout={props.direction}
                    width={width}
                >
                    {ListChild}
                </VariableSizeList>
            )}
        </AutoSizer>
    );
}

export default For;
