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
import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from 'react';
import type { StyledComponent } from 'styled-components';

import styled, { DefaultTheme } from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

type ButtonProps = ComponentProps<typeof Button> & RefAttributes<HTMLButtonElement>;
type ExtraButtonProps = {
    disableBoxShadow?: boolean;
    disableEvents?: boolean;
    fixedSize?: boolean;
};

export const FloatingButton: StyledComponent<
    ForwardRefExoticComponent<ButtonProps>,
    DefaultTheme,
    ExtraButtonProps,
    'styling' | 'children'
> = styled(Button).attrs((props) => ({
    ...props,
    styling: props.styling ?? 'ghost',
}))<ExtraButtonProps>`
    pointer-events: ${(props) => (props.disableEvents ? 'none' : 'all')};
    min-width: 0;
    margin: 0;
    padding: 0 1rem;

    ${(props) => (props.fixedSize ? 'height: 40px; width: 40px;' : '')};

    ${(props) => (props.styling === 'ghost' ? `background-color: ${props.theme.colors.blue1}` : '')};
    ${(props) => (props.disableBoxShadow ? '' : `box-shadow: ${props.theme.shadow.light};`)}
`;
