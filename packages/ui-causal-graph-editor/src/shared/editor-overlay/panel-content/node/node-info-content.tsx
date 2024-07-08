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
import { GraphApi } from '@shared/use-causal-graph-editor';

import { GraphState } from '@types';

import { ColumnWrapper } from '../styled';
import LabelEditor from './label-editor';

export interface NodeInfoContentProps {
    /** Graph API */
    api: GraphApi;
    /** Optional extra sections to show */
    extraSections?: React.ReactElement;
    /** Currently selected node */
    selectedNode: string;
    /** Graph data  */
    state: GraphState;
}

/**
 * Content of the editor frame info panel related to the selected node.
 */
function NodeInfoContent(props: NodeInfoContentProps): JSX.Element {
    const nodeAttributes = props.state.graph.getNodeAttributes(props.selectedNode);

    return (
        <ColumnWrapper>
            <LabelEditor node={nodeAttributes} onLabelChange={props.api.renameNode} />
            {props.extraSections}
        </ColumnWrapper>
    );
}

export default NodeInfoContent;
