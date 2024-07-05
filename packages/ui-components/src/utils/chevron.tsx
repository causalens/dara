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
import * as React from 'react';

import styled from '@darajs/styled-components';
import { ChevronDown } from '@darajs/ui-icons';

interface ChevronProps {
    /** The initial rotation of the chevron, defaults to 0 */
    angles?: [number, number];
    /** An optional class that can be passed to override the styling */
    className?: string;
    /** Whether the chevron is disabled */
    disabled?: boolean;
    /** Whether the parent component isOpen or not */
    isOpen: boolean;
    /** An optional handler for any click events on the element */
    onClick?: (e: React.SyntheticEvent<SVGSVGElement>) => void | Promise<void>;
    /** The native react style prop */
    style?: React.CSSProperties;
}

const shouldForwardProp = (prop: any): boolean => !['isOpen'].includes(prop);

const Icon = styled(ChevronDown).withConfig({ shouldForwardProp })<ChevronProps>`
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    transform: ${(props) => {
        const start = props.angles ? props.angles[0] : 0;
        const end = props.angles ? props.angles[1] : 180;
        return props.isOpen ? `rotate(${end}deg)` : `rotate(${start}deg)`;
    }};
    color: ${(props) => props.theme.colors.grey5};
    transition: transform 0.1s linear;
`;

/**
 * A rotating chevron, that flips from pointing down to up with the isOpen prop
 * @param {ChevronProps} props - the component props
 */
const Chevron = React.forwardRef<any, ChevronProps>((props, ref) => (
    <Icon
        angles={props.angles}
        className={props.className}
        disabled={props.disabled}
        isOpen={props.isOpen}
        onClick={props.onClick}
        ref={ref}
        style={props.style}
    />
));

export default React.memo(Chevron);
