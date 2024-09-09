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
import { Meta } from '@storybook/react';
import { DirectedGraph } from 'graphology';
import * as React from 'react';

import { SHIPPED_UNITS } from '../../../tests/mocks/graphs';
import { PlanarLayout } from '../../shared/graph-layout';
import { CausalGraph, EdgeType, LayeringAlgorithm } from '../../types';
import { CausalGraphEditorProps, default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template, causalGraph, nodeTiersCausalGraph, planarLayoutCausalGraph } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/Planar',
} as Meta;

export const PlanarVertical = Template.bind({});
PlanarVertical.args = {
    editable: true,
    graphData: { ...causalGraph, edges: { input2: causalGraph.edges.input2 } },
    graphLayout: PlanarLayout.Builder.orientation('vertical').build(),
};

export const PlanarHorizontal = Template.bind({});
PlanarHorizontal.args = {
    editable: true,
    graphData: SHIPPED_UNITS,
    graphLayout: PlanarLayout.Builder.build(),
};

export const PlanarLayoutAlgos = (): JSX.Element => {
    const planarSimplex = PlanarLayout.Builder.build();
    planarSimplex.layeringAlgorithm = LayeringAlgorithm.SIMPLEX;

    const planarLongestPath = PlanarLayout.Builder.build();
    planarLongestPath.layeringAlgorithm = LayeringAlgorithm.LONGEST_PATH;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <span>Simplex:</span>
            <CausalGraphViewerComponent
                graphData={planarLayoutCausalGraph}
                graphLayout={planarSimplex}
                style={{ margin: 0 }}
            />
            <span>Longest Path:</span>
            <CausalGraphViewerComponent
                graphData={planarLayoutCausalGraph}
                graphLayout={planarLongestPath}
                style={{ margin: 0 }}
            />
        </div>
    );
};

export const PlanarTiers = Template.bind({});
const planarLayout = PlanarLayout.Builder.build();
planarLayout.tiers = { group: 'meta.test', order_nodes_by: 'order' };
// planarLayout.tiers = nodeTiersList;
// planarLayout.tiers = { group: 'meta.group', rank: ['a', 'b', 'c', 'd', 'e'] };

PlanarTiers.args = {
    editable: true,
    graphData: nodeTiersCausalGraph,
    // graphData: FRAUD,
    graphLayout: planarLayout,
};

const largeGraph = {
    nodes: {
        '10-Q17r14_2': {
            identifier: '10-Q17r14_2',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '10-Q23r1_21': {
            identifier: '10-Q23r1_21',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '10-Q29r5_4': { identifier: '10-Q29r5_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '10-Q35r2_4': { identifier: '10-Q35r2_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '10-Q40r2_8': { identifier: '10-Q40r2_8', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '10-Q54_x2_1_1': {
            identifier: '10-Q54_x2_1_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '10-Q76r4_3': { identifier: '10-Q76r4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '10-Q76r5_1': { identifier: '10-Q76r5_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q22_4_3': { identifier: '5-Q22_4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q25_4_2': { identifier: '5-Q25_4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q25_5_6': { identifier: '5-Q25_5_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q25_6_1': { identifier: '5-Q25_6_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q25_7_3': { identifier: '5-Q25_7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q26_3_4': { identifier: '5-Q26_3_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q27_5_2': { identifier: '5-Q27_5_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q27_5_3': { identifier: '5-Q27_5_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q30_2_4': { identifier: '5-Q30_2_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q34b_4_1': { identifier: '5-Q34b_4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q35_4_1': { identifier: '5-Q35_4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q40_3_2': { identifier: '5-Q40_3_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q41a_2_1': { identifier: '5-Q41a_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q41d_4_1': { identifier: '5-Q41d_4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q43_1_4': { identifier: '5-Q43_1_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q46_1_2': { identifier: '5-Q46_1_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q47_5_3': { identifier: '5-Q47_5_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '5-Q47_6_3': { identifier: '5-Q47_6_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q11_6_5': { identifier: '7-Q11_6_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q1a_4_5': { identifier: '7-Q1a_4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q27_2_42': { identifier: '7-Q27_2_42', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q27_5_32': { identifier: '7-Q27_5_32', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q27_7_1': { identifier: '7-Q27_7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q31_7_0': { identifier: '7-Q31_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q31_7_1': { identifier: '7-Q31_7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q31_8_0': { identifier: '7-Q31_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q47_11_2': { identifier: '7-Q47_11_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q47_6_2': { identifier: '7-Q47_6_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q47_8_2': { identifier: '7-Q47_8_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q48_1_1': { identifier: '7-Q48_1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q50_1_3': { identifier: '7-Q50_1_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q50_2_2': { identifier: '7-Q50_2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q50_2_3': { identifier: '7-Q50_2_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q50_5_1': { identifier: '7-Q50_5_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q50_6_3': { identifier: '7-Q50_6_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q50_8_3': { identifier: '7-Q50_8_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q51_1_1': { identifier: '7-Q51_1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q51_2_1': { identifier: '7-Q51_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_1_0': { identifier: '7-Q52_1_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_2_0': { identifier: '7-Q52_2_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_3_0': { identifier: '7-Q52_3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_4_0': { identifier: '7-Q52_4_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_5_0': { identifier: '7-Q52_5_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_6_0': { identifier: '7-Q52_6_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_7_0': { identifier: '7-Q52_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_8_0': { identifier: '7-Q52_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_99_0': { identifier: '7-Q52_99_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q52_99_1': { identifier: '7-Q52_99_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q53_2_1': { identifier: '7-Q53_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '7-Q54_2_1': { identifier: '7-Q54_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '8-Q39r7_4': { identifier: '8-Q39r7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '8-Q45r1_0': { identifier: '8-Q45r1_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '8-Q45r1_1': { identifier: '8-Q45r1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '8-Q46r9_0': { identifier: '8-Q46r9_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '8-Q46r9_1': { identifier: '8-Q46r9_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q21c1_10_1': {
            identifier: '9-Q21c1_10_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q21c1_16_1': {
            identifier: '9-Q21c1_16_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q47r1_4': { identifier: '9-Q47r1_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q52c_2': { identifier: '9-Q52c_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q63r11_0': { identifier: '9-Q63r11_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q63r3_0': { identifier: '9-Q63r3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q63r7_0': { identifier: '9-Q63r7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar10_1': {
            identifier: '9-Q72ar10_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar11_1': {
            identifier: '9-Q72ar11_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar13_1': {
            identifier: '9-Q72ar13_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar14_1': {
            identifier: '9-Q72ar14_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar15_0': {
            identifier: '9-Q72ar15_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar15_1': {
            identifier: '9-Q72ar15_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar16_1': {
            identifier: '9-Q72ar16_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar17_1': {
            identifier: '9-Q72ar17_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar19_0': {
            identifier: '9-Q72ar19_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar19_1': {
            identifier: '9-Q72ar19_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar20_0': {
            identifier: '9-Q72ar20_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar20_1': {
            identifier: '9-Q72ar20_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar21_0': {
            identifier: '9-Q72ar21_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar22_0': {
            identifier: '9-Q72ar22_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar22_1': {
            identifier: '9-Q72ar22_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar23_1': {
            identifier: '9-Q72ar23_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar25_1': {
            identifier: '9-Q72ar25_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72ar2_0': { identifier: '9-Q72ar2_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar2_1': { identifier: '9-Q72ar2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar3_0': { identifier: '9-Q72ar3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar3_1': { identifier: '9-Q72ar3_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar5_1': { identifier: '9-Q72ar5_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar6_1': { identifier: '9-Q72ar6_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar7_0': { identifier: '9-Q72ar7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72ar9_1': { identifier: '9-Q72ar9_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q72br15_0': {
            identifier: '9-Q72br15_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72br15_1': {
            identifier: '9-Q72br15_1',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72br18_0': {
            identifier: '9-Q72br18_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q72br23_0': {
            identifier: '9-Q72br23_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q73cr7_4': { identifier: '9-Q73cr7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q73r2_1': { identifier: '9-Q73r2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q73r3_5': { identifier: '9-Q73r3_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q73r8_5': { identifier: '9-Q73r8_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q76r11_0': { identifier: '9-Q76r11_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q81ar11_0': {
            identifier: '9-Q81ar11_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q81ar12_0': {
            identifier: '9-Q81ar12_0',
            variable_type: 'unspecified',
            node_class: 'Node',
            meta: {},
        },
        '9-Q91r8_1': { identifier: '9-Q91r8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q97r16_0': { identifier: '9-Q97r16_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        '9-Q97r17_0': { identifier: '9-Q97r17_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        Age: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i4_1: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i4_2: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i4_3: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i4_4: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i4_5: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i5_5: { identifier: 'i5_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i6_1: { identifier: 'i6_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i7_1: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i7_2: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i7_3: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i7_4: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        i7_6: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q12b_3: { identifier: 'q12b_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_1: { identifier: 'q13newuk_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_10: { identifier: 'q13newuk_10', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_11: { identifier: 'q13newuk_11', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_12: { identifier: 'q13newuk_12', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_13: { identifier: 'q13newuk_13', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_14: { identifier: 'q13newuk_14', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_2: { identifier: 'q13newuk_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_3: { identifier: 'q13newuk_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_4: { identifier: 'q13newuk_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_5: { identifier: 'q13newuk_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_6: { identifier: 'q13newuk_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_7: { identifier: 'q13newuk_7', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_8: { identifier: 'q13newuk_8', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q13newuk_9: { identifier: 'q13newuk_9', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q2_1: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q2_2: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q2b_21: { identifier: 'q2b_21', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q2b_22: { identifier: 'q2b_22', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_16: { identifier: 'q3_16', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_19: { identifier: 'q3_19', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_22: { identifier: 'q3_22', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_26: { identifier: 'q3_26', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_32: { identifier: 'q3_32', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_60: { identifier: 'q3_60', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_74: { identifier: 'q3_74', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_75: { identifier: 'q3_75', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_76: { identifier: 'q3_76', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3_77: { identifier: 'q3_77', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3d_7: { identifier: 'q3d_7', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3new_1: { identifier: 'q3new_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3new_12495: { identifier: 'q3new_12495', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3new_3: { identifier: 'q3new_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q3new_4: { identifier: 'q3new_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q42365_1: { identifier: 'q42365_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q4_2: { identifier: 'q4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q4_3: { identifier: 'q4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q4_6: { identifier: 'q4_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q4_7: { identifier: 'q4_7', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q4duk_8: { identifier: 'q4duk_8', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q4duk_9: { identifier: 'q4duk_9', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q8_1: { identifier: 'q8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        q8_3: { identifier: 'q8_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
        r8new_5: { identifier: 'r8new_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
    },
    edges: {
        '10-Q17r14_2': {
            q2_2: {
                source: {
                    identifier: '10-Q17r14_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: {
                    identifier: '10-Q17r14_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '10-Q23r1_21': {
            q2_2: {
                source: {
                    identifier: '10-Q23r1_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: {
                    identifier: '10-Q23r1_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '10-Q29r5_4': {
            q2_1: {
                source: {
                    identifier: '10-Q29r5_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: {
                    identifier: '10-Q29r5_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '10-Q35r2_4': {
            '7-Q52_99_1': {
                source: {
                    identifier: '10-Q35r2_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '10-Q40r2_8': {
            q2_2: {
                source: {
                    identifier: '10-Q40r2_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: {
                    identifier: '10-Q40r2_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '10-Q54_x2_1_1': {
            q2_2: {
                source: {
                    identifier: '10-Q54_x2_1_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: {
                    identifier: '10-Q54_x2_1_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '10-Q76r4_3': {
            q2_2: {
                source: {
                    identifier: '10-Q76r4_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: {
                    identifier: '10-Q76r4_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '10-Q76r5_1': {
            q2_1: {
                source: {
                    identifier: '10-Q76r5_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: {
                    identifier: '10-Q76r5_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q22_4_3': {
            q2_2: {
                source: { identifier: '5-Q22_4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q22_4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q25_4_2': {
            q2_2: {
                source: { identifier: '5-Q25_4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q25_4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q25_5_6': {
            q2_1: {
                source: { identifier: '5-Q25_5_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '5-Q25_5_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q25_6_1': {
            q2_2: {
                source: { identifier: '5-Q25_6_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q25_6_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q25_7_3': {
            q2_1: {
                source: { identifier: '5-Q25_7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '5-Q25_7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q26_3_4': {
            q2_2: {
                source: { identifier: '5-Q26_3_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q26_3_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q27_5_2': {
            q2_2: {
                source: { identifier: '5-Q27_5_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q27_5_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q27_5_3': {
            q2_2: {
                source: { identifier: '5-Q27_5_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q27_5_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q30_2_4': {
            q2_1: {
                source: { identifier: '5-Q30_2_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '5-Q30_2_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q34b_4_1': {
            q2_1: {
                source: {
                    identifier: '5-Q34b_4_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: {
                    identifier: '5-Q34b_4_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q35_4_1': {
            q2_2: {
                source: { identifier: '5-Q35_4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q35_4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q40_3_2': {
            Age: {
                source: { identifier: '5-Q40_3_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q41a_2_1': {
            q2_1: {
                source: {
                    identifier: '5-Q41a_2_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: {
                    identifier: '5-Q41a_2_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q41d_4_1': {
            q2_1: {
                source: {
                    identifier: '5-Q41d_4_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: {
                    identifier: '5-Q41d_4_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q43_1_4': {
            q2_1: {
                source: { identifier: '5-Q43_1_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '5-Q43_1_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q46_1_2': {
            q2_1: {
                source: { identifier: '5-Q46_1_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '5-Q46_1_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q47_5_3': {
            q2_2: {
                source: { identifier: '5-Q47_5_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q47_5_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '5-Q47_6_3': {
            q2_2: {
                source: { identifier: '5-Q47_6_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '5-Q47_6_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q11_6_5': {
            '7-Q52_99_1': {
                source: { identifier: '7-Q11_6_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q1a_4_5': {
            '7-Q31_7_1': {
                source: { identifier: '7-Q1a_4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q1a_4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q27_2_42': {
            q2_1: {
                source: {
                    identifier: '7-Q27_2_42',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: {
                    identifier: '7-Q27_2_42',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q27_5_32': {
            q2_2: {
                source: {
                    identifier: '7-Q27_5_32',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: {
                    identifier: '7-Q27_5_32',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q27_7_1': {
            q2_1: {
                source: { identifier: '7-Q27_7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '7-Q27_7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q31_7_0': {
            '7-Q31_7_1': {
                source: { identifier: '7-Q31_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q31_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q31_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_11: {
                source: { identifier: '7-Q31_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q31_7_1': {
            q13newuk_11: {
                source: { identifier: '7-Q31_7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q31_8_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q31_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q31_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q31_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q31_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q47_11_2': {
            '7-Q52_99_0': {
                source: {
                    identifier: '7-Q47_11_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q47_6_2': {
            q2_1: {
                source: { identifier: '7-Q47_6_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '7-Q47_6_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q47_8_2': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q47_8_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q48_1_1': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q48_1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q48_1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q50_1_3': {
            '7-Q31_7_1': {
                source: { identifier: '7-Q50_1_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q50_1_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q50_2_2': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q50_2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q50_2_3': {
            q2_1: {
                source: { identifier: '7-Q50_2_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '7-Q50_2_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q50_5_1': {
            '7-Q52_99_1': {
                source: { identifier: '7-Q50_5_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q50_6_3': {
            '7-Q52_99_1': {
                source: { identifier: '7-Q50_6_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q50_8_3': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q50_8_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q50_8_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q51_1_1': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q51_1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q51_1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q51_1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q51_2_1': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q51_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q51_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q51_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_1_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_1_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_1_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_1_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_1_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_2_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_2_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_2_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_2_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_2_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_3_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_4_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_4_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_4_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_4_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_4_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_5_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_5_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_5_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_5_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_5_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_6_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_6_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_6_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_6_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_6_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_7_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_8_0': {
            '7-Q31_7_0': {
                source: { identifier: '7-Q52_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: '7-Q52_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q52_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: '7-Q52_8_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_99_0': {
            '7-Q31_7_1': {
                source: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_11: {
                source: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q52_99_1': {
            '7-Q31_7_1': {
                source: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_11: {
                source: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q53_2_1': {
            '7-Q31_7_1': {
                source: { identifier: '7-Q53_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: '7-Q53_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '7-Q54_2_1': {
            q2_1: {
                source: { identifier: '7-Q54_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '7-Q54_2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '8-Q39r7_4': {
            q2_1: {
                source: { identifier: '8-Q39r7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: '8-Q39r7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '8-Q45r1_0': {
            q13newuk_11: {
                source: { identifier: '8-Q45r1_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '8-Q45r1_1': {
            q13newuk_11: {
                source: { identifier: '8-Q45r1_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '8-Q46r9_0': {
            q13newuk_11: {
                source: { identifier: '8-Q46r9_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '8-Q46r9_1': {
            q13newuk_11: {
                source: { identifier: '8-Q46r9_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q21c1_10_1': {
            q2_2: {
                source: {
                    identifier: '9-Q21c1_10_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: {
                    identifier: '9-Q21c1_10_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q21c1_16_1': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q21c1_16_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q47r1_4': {
            q2_2: {
                source: { identifier: '9-Q47r1_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: '9-Q47r1_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q52c_2': {
            '9-Q72br15_0': {
                source: { identifier: '9-Q52c_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q63r11_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q63r11_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q63r3_0': {
            '7-Q52_99_1': {
                source: { identifier: '9-Q63r3_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q63r7_0': {
            '9-Q72br15_0': {
                source: { identifier: '9-Q63r7_0', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar10_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar10_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar11_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar11_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar13_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar13_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar14_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar14_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar15_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72ar15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar15_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar15_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72ar15_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar16_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar16_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar17_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar17_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar19_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72ar19_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar19_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar19_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar20_0': {
            q13newuk_11: {
                source: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar20_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar20_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar21_0': {
            q2_1: {
                source: {
                    identifier: '9-Q72ar21_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: {
                    identifier: '9-Q72ar21_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar22_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72ar22_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar22_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar22_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar23_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar23_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar25_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar25_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar2_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72ar2_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar2_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar2_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar3_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72ar3_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar3_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar3_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar5_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar5_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar6_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar6_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar7_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72ar7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72ar9_1': {
            '9-Q72ar20_0': {
                source: {
                    identifier: '9-Q72ar9_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72br15_0': {
            q13newuk_11: {
                source: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72br15_1': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72br15_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72br18_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72br18_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q72br23_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q72br23_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q73cr7_4': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q73cr7_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q73r2_1': {
            '7-Q52_99_1': {
                source: { identifier: '9-Q73r2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q73r3_5': {
            '9-Q72ar20_0': {
                source: { identifier: '9-Q73r3_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q73r8_5': {
            '9-Q72ar20_0': {
                source: { identifier: '9-Q73r8_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q76r11_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q76r11_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q81ar11_0': {
            '7-Q52_99_1': {
                source: {
                    identifier: '9-Q81ar11_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q81ar11_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q81ar12_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q81ar12_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q91r8_1': {
            '9-Q72ar20_0': {
                source: { identifier: '9-Q91r8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '9-Q72ar20_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q97r16_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q97r16_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        '9-Q97r17_0': {
            '9-Q72br15_0': {
                source: {
                    identifier: '9-Q97r17_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: '9-Q72br15_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        Age: {
            q13newuk_11: {
                source: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i4_2: {
            i4_1: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i4_3: {
            i4_1: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i4_4: {
            i4_1: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_11: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i4_5: {
            i4_3: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_1: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_2: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_3: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_4: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i4_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i5_5: {
            q13newuk_11: {
                source: { identifier: 'i5_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i5_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i6_1: {
            q13newuk_10: {
                source: { identifier: 'i6_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i6_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i7_1: {
            i4_1: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i7_2: {
            i4_1: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_2: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i7_3: {
            i4_1: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_2: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_2: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_4: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_1: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_2: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_3: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_4: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i7_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i7_4: {
            i4_1: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_2: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_2: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_1: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_2: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_3: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_4: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i7_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        i7_6: {
            i4_1: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_11: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q12b_3: {
            q13newuk_12: {
                source: { identifier: 'q12b_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_1: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_2: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_2: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_10: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_11: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_12: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_13: {
            i4_3: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_1: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_2: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_3: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_4: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: {
                    identifier: 'q13newuk_13',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_14: {
            q13newuk_10: {
                source: {
                    identifier: 'q13newuk_14',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: {
                    identifier: 'q13newuk_14',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_2: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_2: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_2: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_1: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_3: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_2: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_2: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_1: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_2: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_4: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: {
                    identifier: 'q13newuk_3',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_4: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_2: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_3: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i4_4: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_1: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_2: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            i7_6: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i7_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_1: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_10: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_10',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_2: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_2',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_9: {
                source: {
                    identifier: 'q13newuk_4',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_5: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_6: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_7: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_8: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q13newuk_9: {
            i4_1: {
                source: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'i4_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_5: {
                source: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_5',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_6: {
                source: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_6',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_7: {
                source: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_7',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_8: {
                source: {
                    identifier: 'q13newuk_9',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: {
                    identifier: 'q13newuk_8',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q2_1: {
            q13newuk_11: {
                source: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q2_2: {
                source: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q2b_22: {
                source: { identifier: 'q2_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_22',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q2_2: {
            q13newuk_11: {
                source: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q2b_21: {
            q13newuk_11: {
                source: { identifier: 'q2b_21', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'q2b_21', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q2b_22: {
            q13newuk_11: {
                source: { identifier: 'q2b_22', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_12: {
                source: { identifier: 'q2b_22', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q2_2: {
                source: { identifier: 'q2b_22', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'q2_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
            q2b_21: {
                source: { identifier: 'q2b_22', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q2b_21',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q3_16: {
            Age: {
                source: { identifier: 'q3_16', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_19: {
            Age: {
                source: { identifier: 'q3_19', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_22: {
            Age: {
                source: { identifier: 'q3_22', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_26: {
            Age: {
                source: { identifier: 'q3_26', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_32: {
            Age: {
                source: { identifier: 'q3_32', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_60: {
            Age: {
                source: { identifier: 'q3_60', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_74: {
            Age: {
                source: { identifier: 'q3_74', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_75: {
            Age: {
                source: { identifier: 'q3_75', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_76: {
            Age: {
                source: { identifier: 'q3_76', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3_77: {
            Age: {
                source: { identifier: 'q3_77', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3d_7: {
            q13newuk_12: {
                source: { identifier: 'q3d_7', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q3new_1: {
            Age: {
                source: { identifier: 'q3new_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3new_12495: {
            Age: {
                source: {
                    identifier: 'q3new_12495',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3new_3: {
            Age: {
                source: { identifier: 'q3new_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q3new_4: {
            Age: {
                source: { identifier: 'q3new_4', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q42365_1: {
            Age: {
                source: { identifier: 'q42365_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q4_2: {
            Age: {
                source: { identifier: 'q4_2', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q4_3: {
            Age: {
                source: { identifier: 'q4_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q4_6: {
            Age: {
                source: { identifier: 'q4_6', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q4_7: {
            Age: {
                source: { identifier: 'q4_7', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: { identifier: 'Age', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                edge_type: '->',
                meta: {},
            },
        },
        q4duk_8: {
            q13newuk_11: {
                source: { identifier: 'q4duk_8', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q4duk_9: {
            q13newuk_12: {
                source: { identifier: 'q4duk_9', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q8_1: {
            '7-Q31_7_0': {
                source: { identifier: 'q8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: 'q8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: 'q8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_1': {
                source: { identifier: 'q8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            q13newuk_11: {
                source: { identifier: 'q8_1', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_11',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        q8_3: {
            '7-Q31_7_0': {
                source: { identifier: 'q8_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q31_7_1': {
                source: { identifier: 'q8_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q31_7_1',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
            '7-Q52_99_0': {
                source: { identifier: 'q8_3', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: '7-Q52_99_0',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
        r8new_5: {
            q13newuk_12: {
                source: { identifier: 'r8new_5', variable_type: 'unspecified', node_class: 'Node', meta: {} },
                destination: {
                    identifier: 'q13newuk_12',
                    variable_type: 'unspecified',
                    node_class: 'Node',
                    meta: {},
                },
                edge_type: '->',
                meta: {},
            },
        },
    },
    version: '0.5.3',
    meta: {},
};

export const PlanarLarge = Template.bind({});

PlanarLarge.args = {
    editable: true,
    graphData: largeGraph,
    graphLayout: PlanarLayout.Builder.build(),
};

function generateRandomDAG(parentsPerNode: number, levels: number): CausalGraph {
    const graph: CausalGraph = {
        nodes: {},
        edges: {},
        version: '0.5.3',
    };

    let nodeCounter = 0;

    function addNode(): string {
        const nodeName = `node${nodeCounter++}`;
        graph.nodes[nodeName] = {
            identifier: nodeName,
            meta: {},
            variable_type: 'unspecified',
        };
        graph.edges[nodeName] = {};
        return nodeName;
    }

    function generateLevel(currentLevel: number): string[] {
        if (currentLevel === 0) {
            // Base case: create and return the sink node
            return [addNode()];
        }

        const currentLevelNodes: string[] = [];
        const childNodes = generateLevel(currentLevel - 1);

        for (const childNode of childNodes) {
            for (let i = 0; i < parentsPerNode - currentLevel; i++) {
                const parentNode = addNode();
                currentLevelNodes.push(parentNode);
                graph.edges[parentNode][childNode] = {
                    source: graph.nodes[parentNode],
                    destination: graph.nodes[childNode],
                    edge_type: EdgeType.DIRECTED_EDGE,
                    meta: {},
                };
            }
        }

        return currentLevelNodes;
    }

    generateLevel(levels);

    return graph;
}

export const PlanarGenerated = (props: CausalGraphEditorProps): JSX.Element => {
    const [parentCount, setParentCount] = React.useState(4);
    const [levelCount, setLevelCount] = React.useState(6);

    const graph = React.useMemo(() => generateRandomDAG(parentCount, levelCount), [parentCount, levelCount]);

    return (
        <>
            <label>
                Parent count:
                <input type="number" value={parentCount} onChange={(e) => setParentCount(parseInt(e.target.value))} />
            </label>
            <label>
                Level count:
                <input type="number" value={levelCount} onChange={(e) => setLevelCount(parseInt(e.target.value))} />
            </label>
            <CausalGraphViewerComponent {...props} graphData={graph} />
        </>
    );
};

PlanarGenerated.args = {
    editable: true,
    graphLayout: PlanarLayout.Builder.build(),
};
