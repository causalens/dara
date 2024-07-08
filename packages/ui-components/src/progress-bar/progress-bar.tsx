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
import { sortBy } from 'lodash';
import * as React from 'react';

import styled, { theme } from '@darajs/styled-components';

interface TrackProps {
    multi?: boolean;
    small?: boolean;
}

const Track = styled.div<TrackProps>`
    position: relative;

    overflow: hidden;
    display: flex;

    width: 100%;
    height: ${(props) => (props.small ? '0.5rem' : '1rem')};

    background-color: ${(props) => props.theme.colors.grey2};
    border-radius: ${(props) => (props.small ? '0.25rem' : '0.5rem')};
`;

interface BarProps {
    color?: string;
    multi?: boolean;
    small?: boolean;
}

const Bar = styled.div<BarProps>`
    position: absolute;

    overflow: ${(props) => (props.multi ? 'hidden' : 'visible')};

    height: 100%;

    background-color: ${(props) => (props.color ? props.color : props.theme.colors.primary)};
    border-radius: ${(props) => (props.small ? '0.25rem' : '0.5rem')};
`;

interface ProgressProp {
    color?: string;
    progress: number;
}

const Text = styled.span<ProgressProp>`
    position: absolute;
    right: 0.5rem;
    bottom: 0.05rem;
    left: 0.5rem;

    height: 100%;

    font-size: 0.75rem;
    color: ${(props) => props.theme.colors.blue1};
    text-align: end;
`;

const defaultColors = [theme.colors.primary, theme.colors.success, theme.colors.warning, theme.colors.error];

/**
 * Takes an input value and converts it into an array. If the input is undefined, it returns a default input array.
 * If the input is already an array, it returns the input itself. Otherwise, it wraps the input inside an array.
 *
 * @param input - The input value that should be arrayified. It can be a value of type T, an array of T, or undefined.
 * @param defaultInput - The default array to return in case the input is undefined.
 *
 * @returns The input arrayified as an array of type T.
 *
 * @typeparam T - The type of the elements in the array.
 */
const arrayify = <T,>(input: T | T[] | undefined, defaultInput: T[]): T[] => {
    if (typeof input === 'undefined') {
        return defaultInput;
    }
    if (Array.isArray(input)) {
        return input;
    }
    return [input];
};

export interface ProgressBarProps {
    /** Standard react className property */
    className?: string;
    /** Optional color prop for the progress bar, should be a hex code. Pass an array for multiple values */
    color?: string | string[];
    /** Optional label for the progress bar. If not provided, the progress will be displayed as a percentage. Pass an array for multiple values */
    label?: React.ReactNode | React.ReactNode[];
    /** The current progress as a percentage. Pass an array for multiple values */
    progress: number | number[];
    /** Set the progress bar to view as a smaller strip with no label */
    small?: boolean;
    /** Native react style property, can be used to fine tune the button appearance */
    style?: React.CSSProperties;
}

/**
 * A simple progress bar component, that displays the current progress to 100% as a bar with a small label
 *
 * @param props see interface for details
 */
function ProgressBar(props: ProgressBarProps): JSX.Element {
    // We need to sort the values to properly render them, so we need to preserve the original index
    const progresses =
        typeof props.progress === 'number' ?
            [{ index: 0, value: props.progress }]
        :   sortBy([...props.progress.map((x, i) => ({ index: i, value: x }))], 'value').reverse();
    const colors = arrayify(props.color, defaultColors.slice(0, progresses.length));
    const labels = arrayify(
        props.label,
        progresses.map((x) => `${x.value}%`)
    );

    return (
        <Track
            className={props.className}
            multi={typeof props.progress !== 'number'}
            small={props.small}
            style={props.style}
        >
            {progresses.map((progress, index) => (
                <Bar
                    color={colors[progress.index]}
                    key={index}
                    multi={typeof props.progress !== 'number'}
                    small={props.small}
                    style={{ width: `${progress.value}%` }}
                >
                    {!props.small && <Text progress={progress.value}>{labels[progress.index]}</Text>}
                </Bar>
            ))}
        </Track>
    );
}

export default ProgressBar;
