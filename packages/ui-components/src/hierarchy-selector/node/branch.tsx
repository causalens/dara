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
import { useState } from 'react';
import * as React from 'react';

import styled, { keyframes, useTheme } from '@darajs/styled-components';
import { Circle } from '@darajs/ui-icons';

import { Chevron } from '../../utils';

const NodeContent = styled.li`
    margin-left: 0.35rem;
    border-left: thin solid ${(props) => props.theme.colors.grey6};

    &::before {
        content: '';

        display: inline-block;

        width: 0.9rem;
        height: 0.8rem;
        margin-right: 0.1rem;

        vertical-align: top;

        border-bottom: thin solid ${(props) => props.theme.colors.grey6};
    }

    &:last-child {
        border-left: none;

        &::before {
            border-left: thin solid ${(props) => props.theme.colors.grey6};
        }
    }
`;

interface CellProps {
    isLeaf?: boolean;
    selected?: boolean;
    selectionAllowed?: boolean;
}

export const Cell = styled.span<CellProps>`
    cursor: ${(props) => (props.selectionAllowed ? 'pointer' : 'normal')};
    font-weight: ${(props) => (props.isLeaf ? 300 : 400)};
    color: ${(props) => {
        if (props.selected) {
            return props.theme.colors.primary;
        }
        return props.isLeaf ? props.theme.colors.grey6 : props.theme.colors.grey5;
    }};
`;

export const CircleIcon = styled(Circle)<CellProps>`
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.4rem;

    color: ${(props) => (props.selected ? props.theme.colors.primary : props.theme.colors.grey6)};
    vertical-align: middle;
`;

const grow = keyframes`
    0% {
        transform: scaleY(0);
        opacity: 0;
    }
    100% {
        transform: scaleY(1);
        opacity: 1;
    }
`;

const contract = keyframes`
    100% {
        transform: scaleY(1);
        opacity: 1;
    }
    0% {
        transform: scaleY(0);
        opacity: 0;
    }
`;

interface DisplayProp {
    open?: boolean;
}

export const NodeWrapper = styled.ul<DisplayProp>`
    transform-origin: top center;

    display: ${(props) => (props.open ? 'block' : 'none')};

    margin: 0;
    margin-left: 1rem;
    padding: 0;
    padding-bottom: 1rem;

    list-style: none;

    animation: ${(props) => (props.open ? grow : contract)} 300ms
        ${(props) => (props.open ? 'ease-out forwards' : 'ease-in forwards')};
`;

export interface HierarchyNode {
    children: Array<HierarchyNode>;
    id: string;
    label: string;
    weight: number;
}

interface BranchProps {
    /** Optional flag for enabling categories to be selected by the user */
    allowSelectCategory?: boolean;
    /** Optional flag for enabling leaves to be selected by the user */
    allowSelectLeaf?: boolean;
    /** Standard react className property */
    className?: string;
    /** The node for the branch */
    content: HierarchyNode;
    /** Optional flag for making the branch initially opened or closed */
    open?: boolean;
    /** Optional flag for enabling categories to be selected by the user */
    selectCategory?: boolean;
    /** Optional function to get id of the node selected by the user */
    selectNode?: (nodeId: string) => void;
    /** The id of the node selected by the user */
    selectedNodeId: string;
    /** Pass through of the style to the node container */
    style?: React.CSSProperties;
}

/**
 * The Branch Component renders each branch of the tree and then recursively renders all the child branches by calling
 * itself again.
 *
 * @param {BranchProps} props - the component props
 */
function Branch(props: BranchProps): JSX.Element {
    const theme = useTheme();
    const [open, setOpen] = useState(props.open || false);

    const toggle = (): void => {
        if (props.content) {
            setOpen(!open);
        }
    };

    const select = (): void => {
        props.selectNode(props.content.id);
    };

    const selectionAllowed =
        (props.allowSelectCategory && props.content.children && props.content.children.length > 0) ||
        (props.allowSelectLeaf && (!props.content.children || props.content.children.length === 0));

    return (
        <NodeContent className={props.className} style={props.style}>
            <CircleIcon selected={props.content.id === props.selectedNodeId} />
            <Cell
                isLeaf={!props.content.children || props.content.children.length === 0}
                onClick={selectionAllowed ? select : toggle}
                selected={props.content.id === props.selectedNodeId}
                selectionAllowed={selectionAllowed}
            >
                {props.content.label}
            </Cell>
            {props.content.children && props.content.children.length > 0 && (
                <Chevron
                    isOpen={open}
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
            <NodeWrapper open={open}>
                {props.content.children &&
                    props.content.children.length > 0 &&
                    props.content.children.map((nodeObj) => (
                        <Branch
                            allowSelectCategory={props.allowSelectCategory}
                            allowSelectLeaf={props.allowSelectLeaf}
                            content={nodeObj}
                            key={nodeObj.id}
                            selectCategory={props.selectCategory}
                            selectNode={props.selectNode}
                            selectedNodeId={props.selectedNodeId}
                        />
                    ))}
            </NodeWrapper>
        </NodeContent>
    );
}

export default Branch;
