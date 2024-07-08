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
import { ButtonBar } from '@darajs/ui-components';
import { Status } from '@darajs/ui-utils';

import { useSettings } from '@shared/settings-context';
import { GraphApi } from '@shared/use-causal-graph-editor';
import { willCreateCycle } from '@shared/utils';

import { EdgeType, GraphState, PagSymbol, SimulationEdge, stringToSymbol, symbolToString } from '@types';

import { ColumnWrapper, SectionTitle } from '../../styled';

const DIRECTED_SYMBOLS = [EdgeType.DIRECTED_EDGE, EdgeType.BACKWARDS_DIRECTED_EDGE] as string[];

const symbolItems: Array<{ label: string; value: PagSymbol }> = [
    { label: 'Directed', value: PagSymbol.ARROW },
    { label: 'Wildcard', value: PagSymbol.CIRCLE },
    { label: 'Undirected', value: PagSymbol.EMPTY },
];

interface EdgeTypeEditorProps {
    /** Graph API */
    api: GraphApi;
    /** The edge meta data */
    edge: SimulationEdge;
    /** The id of the source node */
    source: string;
    /** Graph data  */
    state: GraphState;
    /** The id of the target node */
    target: string;
}

function EdgeTypeEditor(props: EdgeTypeEditorProps): JSX.Element {
    const { onNotify } = useSettings();
    const [tailString, headString] = props.edge.edge_type;

    const head = stringToSymbol(headString, 'head');
    const tail = stringToSymbol(tailString, 'tail');

    function onSymbolUpdate(symbol: PagSymbol, position: 'head' | 'tail'): void {
        const newHead = position === 'head' ? symbolToString(symbol, 'head') : props.edge.edge_type[1];
        const newTail = position === 'tail' ? symbolToString(symbol, 'tail') : props.edge.edge_type[0];

        // Check if replacing the edge with a new one would cause a cycle
        const newSymbol = newTail + newHead;
        if (DIRECTED_SYMBOLS.includes(newSymbol)) {
            const graphClone = props.state.graph.copy();
            graphClone.dropEdge(props.source, props.target);

            const invalidForward =
                newSymbol === EdgeType.DIRECTED_EDGE && willCreateCycle(graphClone, [props.source, props.target]);
            const invalidBackward =
                newSymbol === EdgeType.BACKWARDS_DIRECTED_EDGE &&
                willCreateCycle(graphClone, [props.target, props.source]);

            if (invalidForward || invalidBackward) {
                onNotify?.({
                    key: 'edge-type-change-cycle',
                    message: `Edge type "${newTail}${newHead}" not allowed as it would create a cycle`,
                    status: Status.WARNING,
                    title: 'Cycle detected',
                });

                return;
            }
        }

        props.api.updateEdgeType([props.source, props.target], newTail + newHead);
    }

    return (
        <ColumnWrapper>
            <SectionTitle>Tail Symbol</SectionTitle>
            <ButtonBar
                items={symbolItems}
                onSelect={(i) => onSymbolUpdate(i.value, 'tail')}
                styling="secondary"
                value={symbolItems.find((i) => i.value === tail)}
            />
            <SectionTitle>Head Symbol</SectionTitle>
            <ButtonBar
                items={symbolItems}
                onSelect={(i) => onSymbolUpdate(i.value, 'head')}
                styling="secondary"
                value={symbolItems.find((i) => i.value === head)}
            />
        </ColumnWrapper>
    );
}

export default EdgeTypeEditor;
