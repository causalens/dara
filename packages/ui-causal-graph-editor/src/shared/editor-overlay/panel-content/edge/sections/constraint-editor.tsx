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
import { ButtonBar, Item, Tooltip } from '@darajs/ui-components';
import { ArrowRightLong, ArrowsHorizontal, Ban } from '@darajs/ui-icons';

import { SoftEdgeArrowButton } from '@shared/editor-overlay/buttons';

import { EdgeConstraintItem, EdgeConstraintType } from '@types';

import { ColumnWrapper, SectionTitle } from '../../styled';

// Items should technically have label be a string but ButtonBar just renders the label
// so we're putting a component for it to render instead
interface IconItem {
    label: string | JSX.Element;
    value: any;
}

const constraintItems: IconItem[] = [
    {
        label: (
            <Tooltip content="Hard Directed">
                <span>
                    <ArrowRightLong size="lg" />
                </span>
            </Tooltip>
        ),
        value: EdgeConstraintType.HARD_DIRECTED,
    },
    {
        label: (
            <Tooltip content="Soft Directed">
                <span style={{ alignItems: 'center', display: 'flex' }}>
                    <SoftEdgeArrowButton />
                </span>
            </Tooltip>
        ),
        value: EdgeConstraintType.SOFT_DIRECTED,
    },
    {
        label: (
            <Tooltip content="Undirected">
                <span>
                    <ArrowsHorizontal size="lg" />
                </span>
            </Tooltip>
        ),
        value: EdgeConstraintType.UNDIRECTED,
    },
    {
        label: (
            <Tooltip content="Forbidden">
                <span>
                    <Ban size="lg" />
                </span>
            </Tooltip>
        ),
        value: EdgeConstraintType.FORBIDDEN,
    },
];

export interface ConstraintEditorProps {
    /**
     * Edge constraint for the specific edge
     */
    edgeConstraint?: EdgeConstraintItem;
    /**
     * Handler called when the type of the constraint is updated
     */
    onUpdate: (constraint: EdgeConstraintItem) => void | Promise<void>;
    /**
     * Source of the selected edge
     */
    source: string;
    /**
     * Target of the selected edge
     */
    target: string;
}

/**
 * ConstraintEditor component represents a constraint related to a specific edge.
 * It should be displayed inside the EditorFrame's sidebar to allow the user to
 * specify a constraint type & type of relationship.
 */
function ConstraintEditor(props: ConstraintEditorProps): JSX.Element {
    function updateConstraintType(constraintType: EdgeConstraintItem['type']): void {
        props.onUpdate({
            id: props.edgeConstraint.id,
            source: props.source,
            target: props.target,
            type: constraintType,
        });
    }

    return (
        <ColumnWrapper>
            <SectionTitle>Connection</SectionTitle>
            <ButtonBar
                initialValue={constraintItems.find((i) => i.value === props.edgeConstraint.type) as Item}
                items={constraintItems as any}
                key={props.edgeConstraint.id}
                onSelect={(e) => updateConstraintType(e.value)}
                styling="secondary"
            />
        </ColumnWrapper>
    );
}

export default ConstraintEditor;
