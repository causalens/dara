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
import styled, { useTheme } from '@darajs/styled-components';

import { GraphLegendDefinition } from './legend-data';

const LegendText = styled.span`
    color: ${(props) => props.theme.colors.text};
`;

const Ul = styled.ul`
    all: unset;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
`;
const Li = styled.li`
    all: unset;

    display: flex;
    gap: 1rem;
    align-items: center;

    margin-top: 0.6rem;
`;

interface SvgProps {
    color: string;
    // eslint-disable-next-line react/no-unused-prop-types
    fill?: string;
    // eslint-disable-next-line react/no-unused-prop-types
    transform?: string;
}

function QuestionMark(props: SvgProps): JSX.Element {
    return (
        <path
            d="M 6.554 14.6824 C 5.2834 14.6824 4.2951 15.6706 4.2951 16.9411 C 4.2951 18.2118 5.2198 19.2 6.554 19.2 C 7.761 19.2 8.8128 18.2118 8.8128 16.9411 C 8.8128 15.6706 7.761 14.6824 6.554 14.6824 Z M 8.8904 0 H 5.2834 C 2.5304 0 0.3422 2.1882 0.3422 4.9412 C 0.3422 5.8588 1.1187 6.6353 2.0363 6.6353 C 2.954 6.6353 3.7304 5.8588 3.7304 4.9412 C 3.7304 4.0941 4.3728 3.3882 5.2198 3.3882 H 8.8269 C 9.7375 3.3882 10.5069 4.0941 10.5069 4.9412 C 10.5069 5.5059 10.2245 5.9365 9.7304 6.2188 L 5.7069 8.6823 C 5.1422 9.0353 4.8598 9.6 4.8598 10.1647 V 11.2941 C 4.8598 12.2118 5.6363 12.9882 6.554 12.9882 C 7.4716 12.9882 8.2481 12.2118 8.2481 11.2941 V 11.1529 L 11.4316 9.1765 C 12.9139 8.2588 13.8316 6.6353 13.8316 4.9412 C 13.8952 2.1882 11.7069 0 8.8904 0 Z"
            fill={props.color}
            transform={props.transform}
        />
    );
}

function Chevron(props: SvgProps): JSX.Element {
    return (
        <path
            d="M9.35246 9.97219L9.52924 9.79541L9.50968 9.77585C9.87924 9.23982 9.82567 8.49926 9.34894 8.02254L2.59894 1.27254C2.06186 0.735454 1.1899 0.735455 0.652812 1.27254C0.115728 1.80962 0.115728 2.68159 0.652813 3.21867L6.43156 8.99742L0.656328 14.7761C0.656311 14.7761 0.656294 14.7761 0.656276 14.7761C0.119244 15.3132 0.119262 16.1851 0.656328 16.7222C1.19341 17.2593 2.06538 17.2593 2.60246 16.7222L9.35246 9.97219Z"
            fill={props.color}
            stroke={props.color}
            strokeWidth="0.5"
            transform={props.transform}
        />
    );
}

function FullArrow(props: SvgProps): JSX.Element {
    return (
        <path
            d="M10.2729 10.2713C10.9757 9.56851 10.9757 8.42711 10.2729 7.72428L3.07567 0.52728C2.55838 0.00999588 1.78805 -0.141816 1.11331 0.139317C0.438578 0.42045 0 1.07268 0 1.80362V16.1976C0 16.9229 0.438578 17.5808 1.11331 17.8619C1.78805 18.1431 2.55838 17.9856 3.07567 17.474L10.2729 10.277V10.2713Z"
            fill={props.color}
            transform={props.transform}
        />
    );
}

function EmptyCircle(props: SvgProps): JSX.Element {
    return (
        <circle
            cx="8"
            cy="8"
            fill={props.fill}
            r="6.5"
            stroke={props.color}
            strokeWidth="3"
            transform={props.transform}
        />
    );
}

function Cross(props: SvgProps): JSX.Element {
    return (
        <path
            d="M15.5338 2.73375C16.1588 2.10875 16.1588 1.09375 15.5338 0.46875C14.9088 -0.15625 13.8938 -0.15625 13.2688 0.46875L8.00375 5.73875L2.73375 0.47375C2.10875 -0.15125 1.09375 -0.15125 0.46875 0.47375C-0.15625 1.09875 -0.15625 2.11375 0.46875 2.73875L5.73875 8.00375L0.47375 13.2737C-0.15125 13.8987 -0.15125 14.9138 0.47375 15.5388C1.09875 16.1638 2.11375 16.1638 2.73875 15.5388L8.00375 10.2687L13.2738 15.5337C13.8988 16.1588 14.9138 16.1588 15.5388 15.5337C16.1638 14.9087 16.1638 13.8938 15.5388 13.2688L10.2688 8.00375L15.5338 2.73375Z"
            fill={props.color}
            transform={props.transform}
        />
    );
}

function Bidirected(props: SvgProps): JSX.Element {
    return (
        <>
            <Chevron color={props.color} transform="translate(12, 1)" />
            <Chevron color={props.color} transform="rotate(180, 0, 9) translate(-8, -1)" />
        </>
    );
}

function HalfCircle(props: SvgProps): JSX.Element {
    return (
        <path
            d="M 8.5,0 A 8.5,8.5 0 0,1 8.5,17"
            fill="none"
            stroke={props.color}
            strokeWidth="3"
            transform="translate(15, 1)"
        />
    );
}

type CenterSymbolType = Extract<GraphLegendDefinition, { type: 'edge' }>['center_symbol'];

const CenterSymbols: Record<CenterSymbolType, (props: SvgProps) => JSX.Element> = {
    bidirected: Bidirected,
    cross: Cross,
    none: null,
    question: QuestionMark,
};

type ArrowsType = Extract<GraphLegendDefinition, { type: 'edge' }>['arrow_type'];

const Arrows: Record<ArrowsType, (props: SvgProps) => JSX.Element> = {
    empty: EmptyCircle,
    filled: FullArrow,
    none: null,
    normal: Chevron,
    soft: HalfCircle,
};

/**
 * Component to generate a legend line
 */
function LegendSymbol(props: GraphLegendDefinition): JSX.Element {
    const theme = useTheme();

    if (props.type === 'node') {
        const fillColor = props?.color ?? theme.colors.blue4;
        const borderColor = props?.highlight_color ?? theme.colors.primary;

        return (
            <svg height="16px" viewBox="-40 0 100 25">
                <circle cx="8" cy="12" fill={fillColor} r="12" stroke={borderColor} strokeWidth="1" />
            </svg>
        );
    }

    if (props.type === 'edge') {
        const edgeColor = props?.color ?? theme.colors.grey5;

        const Symbol = CenterSymbols[props?.center_symbol ?? 'none'];
        const Arrow = Arrows[props?.arrow_type ?? 'normal'];

        return (
            <svg height="16px" viewBox="-40 0 100 25">
                <g key={props.label}>
                    <line
                        stroke={edgeColor}
                        strokeDasharray={props?.dash_array ?? 'none'}
                        strokeWidth={4}
                        style={{ opacity: 0.5 }}
                        x1={-25}
                        x2={40}
                        y1={10}
                        y2={10}
                    />
                    {Symbol && <Symbol color={edgeColor} fill={theme.colors.blue1} transform="translate (0, 2)" />}
                    {Arrow && <Arrow color={edgeColor} fill={theme.colors.blue1} transform="translate(25, 1)" />}
                </g>
            </svg>
        );
    }

    return <span style={{ height: '0.5rem', width: '100%' }} />;
}

export interface LegendListProps {
    listItems: GraphLegendDefinition[];
}
export function LegendList({ listItems }: LegendListProps): JSX.Element {
    return (
        <Ul>
            {listItems.map(({ label, ...props }) => (
                <Li key={`${label}-${props.type}`}>
                    <LegendSymbol {...props} />
                    <LegendText>{label}</LegendText>
                </Li>
            ))}
        </Ul>
    );
}
