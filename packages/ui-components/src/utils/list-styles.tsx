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

interface ListProps {
    isOpen: boolean;
    maxItems?: number;
}

const List = styled.div<ListProps>`
    z-index: 5000;

    overflow-y: auto;
    display: ${(props) => (props.isOpen ? 'flex' : 'none')};
    flex-direction: column;

    max-height: calc(${(props) => (props.maxItems || 5) * 2}em + 2px);

    border: 1px solid ${(props) => props.theme.colors.grey3};
`;

const NoItemsLabel = styled.span`
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;

    height: 2rem;

    font-size: 1rem;
    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.blue1};
`;

export { List, NoItemsLabel };
