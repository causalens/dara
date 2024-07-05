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

const shouldForwardProp = (prop: any): boolean => !['color', 'width'].includes(prop);

export interface BadgeProps {
    /** The label of the badge, can be any react node */
    children: React.ReactNode;
    /** The main color of the badge */
    color: string;
    /** An optional height parameter, if not provided 18px */
    height?: number;
    /** An optional param that defines whether badge shows outline instead or filled styling, if not provided defaults to false */
    outline?: boolean;
    /** An optional width parameter, if not provided the badge will scale to the content */
    width?: string;
}

/**
 * A simple badge component
 *
 * @param {BadgeProps} props - the component props
 */
const Badge = styled.span.withConfig({ shouldForwardProp })<BadgeProps>`
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: ${(props) => props.width || 'auto'};
    height: ${(props) => (props.height ? `${props.height}px` : '2rem')};
    padding: 0 0.75rem;

    font-size: 0.875rem;
    font-weight: 400;
    color: ${(props) => (props.outline ? props.color : props.theme.colors.blue1)};

    background-color: ${(props) => (props.outline ? props.theme.colors.blue1 : props.color)};
    border: 1px solid ${(props) => props.color};
    border-radius: ${(props) => (props.height ? `${props.height / 2}px` : '1rem')};
`;

export default Badge;
