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

import { default as ProgressBarComponent, ProgressBarProps } from './progress-bar';

export default {
    component: ProgressBarComponent,
    title: 'UI Components/Progress Bar',
} as Meta;

export const ProgressBar = (args: ProgressBarProps): JSX.Element => <ProgressBarComponent {...args} />;
ProgressBar.args = {
    progress: 33,
    small: false,
};

// Now that we have multi as well, could we have two stories one for multi and one for single bars?

export const ProgressBarMulti = (args: ProgressBarProps): JSX.Element => <ProgressBarComponent {...args} />;
ProgressBarMulti.args = {
    label: ['Available', 'Used', 'Limit', 'Total'],
    progress: [10, 5, 30, 80],
    small: false,
};
