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
import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';

import { default as TabsComponent, type TabsProps } from './tabs';

const meta: Meta<TabsProps<string>> = {
    component: TabsComponent,
    title: 'UI Components/Tabs',
};

export default meta;
type Story = StoryObj<TabsProps<string>>;

const sampleTabs = ['Tab 1', 'Tab 2', 'Tab 3'];

export const Tabs: Story = {
    args: {
        tabs: sampleTabs,
    },
    render: (args: TabsProps<string>): JSX.Element => {
        const [selectedTab, setSelectedTab] = useState<string>(sampleTabs[0]);

        const onSelectTab = (tab: any): void => {
            setSelectedTab(tab);
        };

        return <TabsComponent {...args} onSelectTab={onSelectTab} selectedTab={selectedTab} />;
    },
};
