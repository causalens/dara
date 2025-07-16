import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import Button from '../button/button';
import { default as DropdownMenuComponent, type DropdownMenuProps } from './dropdown-menu';

const meta: Meta<DropdownMenuProps> = {
    title: 'UI Components/Dropdown Menu',
    component: DropdownMenuComponent,
    args: {
        onClick: fn(),
    },
};

export default meta;
type Story = StoryObj<DropdownMenuProps>;

export const DropdownMenu: Story = {
    args: {
        menuItems: [
            [
                {
                    label: 'Item 1',
                },
                {
                    label: 'Item 2',
                },
                {
                    label: 'Item 3',
                },
            ],
            [
                {
                    label: 'Item 4',
                },
                {
                    label: 'Item 5',
                },
                {
                    label: 'Item 6',
                },
            ],
        ],
        button: <Button>Open</Button>,
    },
};

export const Multiple = (): React.ReactNode => {
    return (
        <div style={{ display: 'flex', gap: '6rem' }}>
            <DropdownMenuComponent
                menuItems={[
                    [
                        {
                            label: 'Item 1',
                        },
                        {
                            label: 'Item 2',
                        },
                        {
                            label: 'Item 3',
                        },
                    ],
                    [
                        {
                            label: 'Item 4',
                        },
                        {
                            label: 'Item 5',
                        },
                        {
                            label: 'Item 6',
                        },
                    ],
                ]}
                button={<Button>Open</Button>}
            />
            <DropdownMenuComponent
                menuItems={[
                    [
                        {
                            label: 'Item 7',
                        },
                        {
                            label: 'Item 8',
                        },
                        {
                            label: 'Item 9',
                        },
                    ],
                    [
                        {
                            label: 'Item 10',
                        },
                        {
                            label: 'Item 11',
                        },
                        {
                            label: 'Item 12',
                        },
                    ],
                ]}
                button={<Button>Open</Button>}
            />
        </div>
    );
};
