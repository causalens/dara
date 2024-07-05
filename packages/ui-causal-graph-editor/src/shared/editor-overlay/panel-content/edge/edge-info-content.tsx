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
import { ReactElement } from 'react';

import { useSettings } from '@shared/settings-context';
import { GraphApi } from '@shared/use-causal-graph-editor';

import { EdgeConstraintItem, GraphState } from '@types';

import { ColumnWrapper } from '../styled';
import EdgeEditor from './edge-editor';
import DescriptionEditor from './sections/description-editor';
import DirectionEditor from './sections/direction-editor';

export interface EdgeInfoContentProps {
    /** Graph API */
    api: GraphApi;
    /** Optional extra sections to show */
    extraSections?: ReactElement;
    /** Handler to confirm/reverse currently selected edge */
    onConfirmDirection: (reverse: boolean) => void;
    /** Handler to update a given constraint */
    onUpdateConstraint: (constraint: EdgeConstraintItem) => void | Promise<void>;
    /** Constraint related to the edge */
    selectedConstraint?: EdgeConstraintItem;
    /** Currently selected edge */
    selectedEdge: [string, string];
    /** Graph data  */
    state: GraphState;
}

/**
 * Content of the editor frame info panel related to the selected edge.
 */
function EdgeInfoContent(props: EdgeInfoContentProps): JSX.Element {
    const { editable } = useSettings();

    const [source, target] = props.selectedEdge;
    const edgeAttributes = props.state.graph.getEdgeAttributes(source, target);
    const sourceAttributes = props.state.graph.getNodeAttributes(source);
    const targetAttributes = props.state.graph.getNodeAttributes(target);

    return (
        <>
            <DirectionEditor
                edgeType={edgeAttributes.edge_type}
                onConfirmDirection={props.onConfirmDirection}
                source={sourceAttributes['meta.rendering_properties.label'] ?? source}
                target={targetAttributes['meta.rendering_properties.label'] ?? target}
            />

            <ColumnWrapper $gap={1} $scrollable>
                {(editable || edgeAttributes['meta.rendering_properties.description']) && (
                    <DescriptionEditor api={props.api} edge={edgeAttributes} selectedEdge={props.selectedEdge} />
                )}
                {editable && (
                    <EdgeEditor
                        api={props.api}
                        edge={edgeAttributes}
                        edgeConstraint={props.selectedConstraint}
                        onUpdateConstraint={props.onUpdateConstraint}
                        source={source}
                        state={props.state}
                        target={target}
                    />
                )}
                {props.extraSections}
            </ColumnWrapper>
        </>
    );
}

export default EdgeInfoContent;
