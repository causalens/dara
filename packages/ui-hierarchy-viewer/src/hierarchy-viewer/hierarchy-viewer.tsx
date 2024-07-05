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
import * as React from 'react';

import styled from '@darajs/styled-components';
import { useDimensions } from '@darajs/ui-utils';

import Treemap, { Node } from './treemap';

const Wrapper = styled.div`
    width: 100%;
    height: 100%;
`;

interface HierarchyViewerProps {
    /** Allow leaf nodes to be clicked */
    allowLeafClick?: boolean;
    /** Allow parent nodes to be clicked */
    allowParentClick?: boolean;
    /** Standard classname prop */
    className?: string;
    /** The data that get passed to the component.
     * Each node must contain atleast the label and id while the leaf nodes should contain the weights
     * */
    data: Node;
    /** onClick handler for clicking on nodes of the treemap */
    onClick?: (node: Node) => void | Promise<void>;
    /** Optional style that can be passed to the wrapper */
    style?: React.CSSProperties;
}

/**
 * The Hierarchy component that takes the data and converts it into a nested treemap.
 * The component takes up the full width and height of the parent container.
 * The component shows a tooltip that shows the weight of the node.
 *
 * @param {HierarchyViewerProps} params - the component props
 */
function HierarchyViewer(props: HierarchyViewerProps): JSX.Element {
    const [ref, dimensions] = useDimensions<HTMLDivElement>();
    return (
        <Wrapper className={props.className} id="hierarchy-viewer-root" ref={ref} style={props.style}>
            <Treemap
                allowLeafClick={props.allowLeafClick}
                allowParentClick={props.allowParentClick}
                data={props.data}
                height={dimensions.height}
                onClick={props.onClick}
                width={dimensions.width}
            />
        </Wrapper>
    );
}

export default HierarchyViewer;
