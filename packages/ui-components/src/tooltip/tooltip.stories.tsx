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

import { default as TooltipComponent, TooltipProps } from './tooltip';

export default {
    component: TooltipComponent,
    title: 'UI Components/Tooltip',
} as Meta;

export const Tooltip = (args: TooltipProps): JSX.Element => (
    <div style={{ alignItems: 'center', display: 'flex', height: '100%', justifyContent: 'center', width: '100%' }}>
        <TooltipComponent {...args} />
    </div>
);

Tooltip.args = {
    children: <div>Hover over me</div>,
    content: <div>This is a tooltip!</div>,
    placement: 'top',
    styling: 'default',
};
