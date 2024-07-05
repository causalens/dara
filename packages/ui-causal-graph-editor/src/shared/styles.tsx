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
import styled from '@darajs/styled-components';

export const Wrapper = styled.div`
    overflow: hidden;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;

    width: 100%;
`;

export const Center = styled.div`
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    justify-content: center;
`;

export const Graph = styled.div`
    cursor: grab;

    /* This is a CSS trick for the graph to fill the available space of the flex container */
    position: absolute;
    inset: 0;

    overflow: hidden;
    flex: 1 1 auto;

    width: 100%;
    height: 100%;

    border: 1px solid ${(props) => props.theme.colors.grey2};
    border-radius: 4px;
`;
