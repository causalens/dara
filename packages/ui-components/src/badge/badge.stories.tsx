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

import { theme } from '@darajs/styled-components';

import Badge, { BadgeProps } from './badge';

/**
 * As a workaround to storybook not liking bare styled-components:
 * wrap in a React component wrapper
 * and set meta.component to point at the wrapper instead of the actual component
 *
 * Otherwise the documentation auto-generation does not work
 */
export const BadgeWrapper = (props: BadgeProps): JSX.Element => <Badge {...props} />;
BadgeWrapper.storyName = 'Badge';

BadgeWrapper.args = {
    children: ['Badge'],
    color: theme.colors.primary,
};

export default {
    component: BadgeWrapper,
    title: 'UI Components/Badge',
} as Meta;
