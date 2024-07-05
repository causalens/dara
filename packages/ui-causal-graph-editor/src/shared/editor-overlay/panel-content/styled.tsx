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
import { ComboBox } from '@darajs/ui-components';

export const ColumnWrapper = styled.div<{ $fillHeight?: boolean; $gap?: number; $scrollable?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: ${(props) => props.$gap ?? 0.75}rem;

    width: 100%;
    height: ${(props) => (props.$fillHeight ? '100%' : 'auto')};

    ${(props) =>
        props.$scrollable &&
        `
        overflow-y: auto;
        flex-grow: 1;
    `}
`;

export const SectionTitle = styled.h4`
    font-size: 1rem;
    font-weight: 400;
    color: ${(props) => props.theme.colors.text};
`;

export const PanelSelect = styled(ComboBox)`
    & > div {
        background-color: ${(props) => props.theme.colors.blue1};
    }
`;
