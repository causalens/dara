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

import styled, { theme } from '@darajs/styled-components';

import ContextMenu, { MenuAction } from './context-menu';

const ResultItem = ContextMenu<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>>('div');

const StyledResult = styled(ResultItem)`
    width: 100px;
    height: 100px;
    margin: 5px;
    background-color: ${() => theme.colors.success};
`;

const actions: MenuAction[] = [
    {
        action: () => null,
        label: 'Label 1',
    },
    {
        action: () => null,
        label: 'Label 2',
    },
    {
        action: () => null,
        label: 'Label 3',
    },
];

export const ContextMenuItem = (): JSX.Element => (
    <div>
        <StyledResult actions={actions} />;
        <StyledResult actions={actions} />;
        <StyledResult actions={actions} />;
    </div>
);

const meta = {
    component: ContextMenuItem,
    title: 'UI Components/ContextMenu',
} as Meta;

export default meta;
