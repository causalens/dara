/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useEffect, useState } from 'react';
import * as React from 'react';

import styled, { useTheme } from '@darajs/styled-components';

import { Chevron } from '../utils';
import Branch, { Cell, CircleIcon, HierarchyNode, NodeWrapper } from './node/branch';

const Wrapper = styled.div`
    overflow: scroll;
`;

const Root = styled.div`
    cursor: pointer;
    margin-left: 1rem;
`;

interface HierarchySelectorProps {
    /** Optional flag for enabling categories to be selected by the user */
    allowSelectCategory?: boolean;
    /** Optional flag for enabling leaves to be selected by the user */
    allowSelectLeaf?: boolean;
    /** Standard react className property */
    className?: string;
    /** Optional function to get id of the node selected by the user */
    onSelect?: (nodeId: string) => void | Promise<void>;
    /** The root node for the hierarchy selector, the node should contain an id, label and array of children nodes */
    rootNode: HierarchyNode;
    /** Optional flag for making the root node initially opened or closed */
    rootOpen?: boolean;
    /** Selected, the selected node to display */
    selected?: string;
    /** Pass through of the style to the root container */
    style?: React.CSSProperties;
}

/**
 * The Hierarchy Selector Component can be used to create a hierarchy tree where user can select any of the nodes.
 * Each selection can be captured by passing the onSelect function.
 * Passing the rootNode is enough to define a Hierarchy Selector.
 *
 * @param {HierarchySelectorProps} props - the component props
 */
function HierarchySelector(props: HierarchySelectorProps): JSX.Element {
    const theme = useTheme();
    const [rootOpen, setRootOpen] = useState(props.rootOpen || false);
    const [selectedNodeId, setSelectedNodeId] = useState(props.selected);

    useEffect(() => {
        if (props.selected) {
            setSelectedNodeId(props.selected);
        }
    }, [props.selected]);

    const toggle = (): void => {
        setRootOpen(!rootOpen);
    };

    const selectNode = (nodeId: string): void => {
        setSelectedNodeId(nodeId);
        props.onSelect?.(nodeId);
    };

    const { label, id, children } = props.rootNode;
    return (
        <Wrapper className={props.className} style={props.style}>
            <Root>
                <CircleIcon selected={id === selectedNodeId} />
                <Cell
                    onClick={props.allowSelectCategory || children.length === 0 ? () => selectNode(id) : toggle}
                    selected={id === selectedNodeId}
                >
                    {label}
                </Cell>
                {children.length > 0 && (
                    <Chevron
                        isOpen={rootOpen}
                        onClick={toggle}
                        style={{
                            color: theme.colors.grey5,
                            cursor: 'pointer',
                            height: '0.8rem',
                            marginLeft: '0.5rem',
                            verticalAlign: 'middle',
                            width: '0.8rem',
                        }}
                    />
                )}
            </Root>
            <NodeWrapper open={rootOpen}>
                {children &&
                    children.map((nodeObj) => (
                        <Branch
                            allowSelectCategory={props.allowSelectCategory}
                            allowSelectLeaf={props.allowSelectLeaf}
                            content={nodeObj}
                            key={nodeObj.id}
                            open={rootOpen}
                            selectNode={selectNode}
                            selectedNodeId={selectedNodeId}
                        />
                    ))}
            </NodeWrapper>
        </Wrapper>
    );
}
export { HierarchyNode };
export default HierarchySelector;
