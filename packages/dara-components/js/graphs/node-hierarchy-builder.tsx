import { useRef } from 'react';

import {
    type Action,
    type StyledComponentProps,
    type Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { type Node, NodeHierarchyBuilder as UINodeHierarchyBuilder } from '@darajs/ui-causal-graph-editor';

type NodeType = Node | string;

interface NodeHierarchyBuilderProps extends StyledComponentProps {
    /** Whether the component is in editable mode */
    editable: boolean;
    /** Optional font size of node text in pixels */
    node_font_size?: number;
    /** Optional diameter of nodes displayed in pixels */
    node_size?: number;
    /** List of nodes to display */
    nodes: Variable<Array<NodeType[]>> | Array<NodeType[]>;
    /** Optional action to call on all hierarchy changes */
    on_update?: Action;
    /** Optional flag whether to wrap the text inside nodes instead of using an ellipsis */
    wrap_node_text?: boolean;
}

const StyledHierarchyBuilder = injectCss(UINodeHierarchyBuilder);

/**
 * The NodeHierarchyBuilder component visually represents node hierarchy in layers, allowing the user
 * to re-arrange the nodes inside layers, move them between layers and add/delete new layers.
 */
function NodeHierarchyBuilder(props: NodeHierarchyBuilderProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const mounted = useRef(false);
    const [nodes, setNodes] = useVariable(props.nodes);
    const updateHandler = useAction(props.on_update);

    if (mounted.current === false) {
        /**
         * On mount check the variable holds a list of lists.
         * We don't want to coerce the type as that could change the type of the input variable which could be unexpected.
         *
         * The Python side does type checking if a raw value is used but it's not possible
         * to check the value inside the variable - the type checking needs to happen here
         *
         * This is using a ref rather than useEffect as we need it to run before passing it to the UI component
         * as this would cause a 'cryptic' error
         */
        if (
            !(
                Array.isArray(nodes) &&
                nodes.every(
                    (layer) =>
                        Array.isArray(layer) &&
                        layer.every((node) => typeof node === 'string' || typeof node === 'object')
                )
            )
        ) {
            throw new Error('NodeHierarchyBuilder expects "nodes" to be a list of lists of strings or Node objects');
        }
        mounted.current = true;
    }

    function onUpdate(newNodes: string[][]): void {
        setNodes(newNodes);
        updateHandler(newNodes);
    }

    return (
        <StyledHierarchyBuilder
            $rawCss={css}
            nodeFontSize={props.node_font_size}
            nodeSize={props.node_size}
            nodes={nodes}
            onUpdate={onUpdate}
            style={style}
            viewOnly={!props.editable}
            wrapNodeText={props.wrap_node_text}
        />
    );
}

export default NodeHierarchyBuilder;
