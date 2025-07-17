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
import type { Meta } from '@storybook/react-vite';
import React from 'react';

import styled, { theme } from '@darajs/styled-components';

import ContextMenu, { type MenuAction, useContextMenu } from './context-menu';

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
        <StyledResult actions={actions} />
        <StyledResult actions={actions} />
        <StyledResult actions={actions} />
    </div>
);

// New render prop pattern usage with onClick handler
export const WithRenderProp = (): JSX.Element => {
    const { onContextMenu, contextMenu } = useContextMenu({
        menuItems: [
            [
                { label: 'Copy', icon: '📋' },
                { label: 'Paste', icon: '📄' },
            ],
            [
                { label: 'Delete', icon: '🗑️' },
            ],
        ],
        onClick: (item, index) => {
            // eslint-disable-next-line no-console
            console.log('Clicked:', item.label, 'at index:', index);
            // Handle the click based on the item
            if (item.label === 'Copy') {
                // eslint-disable-next-line no-alert
                alert('Copy clicked!');
            } else if (item.label === 'Paste') {
                // eslint-disable-next-line no-alert
                alert('Paste clicked!');
            } else if (item.label === 'Delete') {
                // eslint-disable-next-line no-alert
                alert('Delete clicked!');
            }
        },
    });

    return (
        <div>
            <div 
                onContextMenu={onContextMenu} 
                style={{ 
                    width: '200px',
                    height: '100px',
                    padding: '20px', 
                    border: '2px dashed #ccc',
                    margin: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.blue1
                }}
            >
                Right click me for new API context menu!
            </div>
            {contextMenu}
        </div>
    );
};

const meta: Meta<typeof ContextMenuItem> = {
    title: 'UI Components/ContextMenu',
    component: ContextMenuItem,
};

export default meta;
