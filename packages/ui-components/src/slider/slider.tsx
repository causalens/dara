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
import { ticks as d3Ticks } from 'd3-array';
import isEqual from 'lodash/isEqual';
import round from 'lodash/round';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Slider as AriaSlider, SliderThumb, SliderTrack, type SliderTrackRenderProps } from 'react-aria-components';

import styled from '@darajs/styled-components';
import { SwapHorizontal } from '@darajs/ui-icons';

import Button from '../button/button';
import Tooltip from '../tooltip/tooltip';
import { InteractiveComponentProps } from '../types';
import SliderInputField from './slider-input-field';

/**
 * Compute what step should be used for the given domain difference
 *
 * @param difference difference
 */
export function computeStep(difference: number): number {
    const log = Math.floor(Math.log10(difference));
    const step = 10 ** Math.floor(log) / 10;

    // If the step is a decimal, round it to the correct number of digits
    // to prevent floating-point errors
    if (log < 0) {
        const precisionString = step.toFixed(Math.abs(log) + 1);
        return parseFloat(precisionString);
    }

    return step;
}

/**
 * Map a value to its closest step.
 *
 * @param value value to map
 * @param step current step
 */
function mapToClosestStep(value: number, step: number): number {
    // this has to be rounded as otherwise we could get floating point errors
    const stepsNumber = parseFloat((value / step).toFixed(1));

    const mappedRaw = Math.floor(stepsNumber) * step;
    const fractionDigits = Math.abs(Math.floor(Math.log10(step)));
    return parseFloat(mappedRaw.toFixed(fractionDigits));
}

const SliderWrapper = styled.div`
    display: flex;
    width: 100%;
`;

const SliderInner = styled.div`
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
`;

const StyledSlider = styled(AriaSlider)`
    overflow: hidden;
    display: inline-flex;
    flex-direction: column;
    justify-content: center;

    width: 100%;
    padding: 0 1rem;
`;

const StyledSliderTrack = styled(SliderTrack)`
    cursor: pointer;
    width: 100%;
    height: 3rem;

    &[data-focus-visible] {
        outline: 2px solid ${(props) => props.theme.colors.primary};
        outline-offset: 2px;
    }
`;

const SliderRail = styled.div`
    position: absolute;
    top: 50%;
    transform: translateY(-50%);

    width: 100%;
    height: 0.25rem;

    background-color: ${(props) => props.theme.colors.grey2};
    border-radius: 0.125rem;
`;

interface HasTicksProp {
    hasTicks: boolean;
}

const StyledSliderThumb = styled(SliderThumb)<HasTicksProp>`
    cursor: pointer;

    position: absolute;
    z-index: 2;
    top: 50%;

    width: 1rem;
    height: 1rem;

    background-color: ${(props) => props.theme.colors.primary};
    border-radius: 50%;

    transition: transform 0.2s ease;

    &[data-hovered] {
        transform: translateY(-50%) scale(1.1);
    }

    &[data-focus-visible] {
        outline: 2px solid ${(props) => props.theme.colors.primary};
        outline-offset: 2px;
    }

    &[data-disabled] {
        cursor: not-allowed;
        opacity: 0.5;
    }
`;

const Track = styled.div`
    position: absolute;
    top: 50%;
    transform: translateY(-50%);

    height: 0.25rem;

    background-color: ${(props) => props.theme.colors.primary};
    border-radius: 0.125rem;
`;

const TrackLabel = styled.span`
    position: absolute;
    z-index: 1;
    transform: translateX(-50%);
    color: ${(props) => props.theme.colors.grey6};
`;

const SliderTicks = styled.div`
    overflow: hidden;
`;

interface TickProps {
    showLine: boolean;
}

const Tick = styled.span<TickProps>`
    position: absolute;
    top: 2.125rem;
    font-size: 0.875rem;
    color: ${(props) => props.theme.colors.grey6};

    &${(props) => (props.showLine ? '' : ':not(:first-child):not(:last-child)')}::before {
        content: '';

        position: fixed;
        z-index: 1;
        left: 50%;
        transform: translateX(-50%);

        display: block;

        width: 0.125rem;
        height: 0.125rem;
        margin-top: -0.685rem;

        background-color: ${(props) => props.theme.colors.grey3};
        border-radius: 50%;
    }
`;

const SwapButton = styled(Button).attrs({ styling: 'plain' })`
    flex-shrink: 0;

    width: min-content;
    height: min-content;
    margin-top: 0.3rem;
    padding: 0 0.25rem;

    svg {
        cursor: pointer;
    }
`;

/**
 * Helper to get the transformation for the tick labels, has the affect to tuck in the start and end labels so they
 * don't get cut off
 *
 * @param idx the idx of the tick
 * @param length the length of the tick array
 */
function getTickTransform(idx: number, length: number): string {
    if (idx === 0) {
        return 'translateX(-0.7rem)';
    }
    return idx === length - 1 ? 'translateX(-100%) translateX(0.7rem)' : 'translateX(-50%)';
}

/**
 * Generate tick values.
 * If ticks is a list of values, return those values and calculate the percent for each tick.
 * If ticks is a number, first calculate interpolated ticks between the domain min/max.
 *
 * @param ticks - the number of ticks or an array of tick values
 * @param domain - the domain of the slider
 */
function getTicks(
    ticks: number | number[] | undefined,
    domain: [min: number, max: number]
): { value: number; percent: number }[] {
    if (!ticks) {
        return [];
    }

    const [min, max] = domain;

    // tick values
    const values = Array.isArray(ticks) ? ticks : d3Ticks(min, max, ticks);
    return values.map((val) => ({ value: val, percent: ((val - min) / (max - min)) * 100 }));
}

function correctValues(values: number[], domain: [number, number], step: number): number[] {
    return values.map((value) => {
        // First clamp to domain
        const clampedValue = Math.max(domain[0], Math.min(domain[1], value));
        // Then snap to nearest step
        return mapToClosestStep(clampedValue, step);
    });
}

/**
 * Hook to handle value correction when domain/step changes.
 * Watches for changes to domain/step and calls onChange with corrected values to let parent components know.
 *
 * @param values - the values to correct
 * @param domain - the domain of the slider
 * @param step - the step of the slider
 * @param onChange - the onChange handler
 * @param getValueLabel - the getValueLabel handler
 */
function useValueCorrection<T>(
    values: number[] | undefined,
    domain: [number, number],
    step: number,
    onChange?: (values: Array<T>) => void | Promise<void>,
    getValueLabel?: (value: number) => T
): void {
    const previousConstraints = useRef({ domain, step });

    useEffect(() => {
        // Only correct values if constraints actually changed and we have controlled values
        const constraintsChanged =
            !isEqual(previousConstraints.current.domain, domain) || previousConstraints.current.step !== step;

        if (!constraintsChanged || !values?.length || !onChange) {
            previousConstraints.current = { domain, step };
            return;
        }

        // Check if any values need correction
        const correctedValues = correctValues(values, domain, step);

        // Only fire onChange if values actually changed
        if (!isEqual(values, correctedValues)) {
            const formattedValues = correctedValues.map(getValueLabel);
            onChange(formattedValues);
        }

        previousConstraints.current = { domain, step };
    }, [domain, step, values, onChange, getValueLabel]);
}

export interface BaseSliderProps<T> extends InteractiveComponentProps<Array<number>> {
    'aria-label'?: string;
    thumbLabels?: string[];
    /** An optional flag to disable the input alternative switch render, its false by default */
    disableInputAlternative?: boolean;
    /** The domain defines the range of possible values that the slider can take */
    domain: [number, number];
    /** The getValueLabel can be used to map a numeric value to something else when displayed in the UI */
    getValueLabel?: (value: number) => T;
    /** An optional onChange handler that will be called when the current value of any handle changes */
    onChange?: (values: Array<T>) => void | Promise<void>;
    /** The step size for changes in the slider */
    step?: number;
    /**
     * An optional parameter to control the number of ticks, alternatively an array can be passed to specify a specific
     * set of ticks to display
     */
    ticks?: Array<number> | number;
    /** An array of track labels that will be shown above the tracks */
    trackLabels?: Array<string>;
    /** Whether a track should be drawn from the right most handle to the end of the rail */
    trackToEnd?: boolean;
    /** Whether a track should be drawn from the left most handle to the start of the rail */
    trackToStart?: boolean;
    /** The starting values for the handles, the number of values === the number of handles created */
    values?: Array<number>;
}

/**
 * The BaseSlider component forms the basis for the other sliders. It wraps the react-aria-components library
 * and adds a simple UI to the component, with support for multiple handle sliders.
 */
function BaseSlider<T extends string | number | React.ReactNode>({
    'aria-label': ariaLabel,
    thumbLabels,
    domain,
    getValueLabel,
    initialValue,
    onChange,
    step,
    style,
    ticks = 5,
    trackLabels,
    trackToStart = true,
    trackToEnd = false,
    disableInputAlternative = false,
    values,
    className,
}: BaseSliderProps<T>): JSX.Element {
    // If step isn't set then pick a reasonable one
    const adjustedStep = useMemo(() => {
        if (step) {
            return step;
        }
        return computeStep(domain[1] - domain[0]);
    }, [domain, step]);

    // Handle value correction for controlled mode
    useValueCorrection(values, domain, adjustedStep, onChange, getValueLabel);

    const [showInputs, setShowInputs] = useState(false);

    // Handle controlled/uncontrolled mode
    const defaultValue = useMemo(() => {
        const initial = initialValue?.map((v) => mapToClosestStep(v, adjustedStep)) || [domain[0]];
        return initial.length === 1 ? initial[0] : initial;
    }, [initialValue, adjustedStep, domain]);

    const isControlled = values !== undefined;

    // For controlled mode, we need to ensure values are valid before using them
    const safeControlledValues = useMemo(() => {
        if (!isControlled || !values?.length) {
            return undefined;
        }

        // Correct any invalid values for internal use
        return correctValues(values, domain, adjustedStep);
    }, [values, isControlled, domain, adjustedStep]);

    const handleChange = useCallback(
        (value: number | number[]) => {
            if (!onChange) {
                return;
            }

            const valueArray = Array.isArray(value) ? value : [value];
            const formattedValues = valueArray.map(getValueLabel);
            onChange(formattedValues);
        },
        [onChange, getValueLabel]
    );

    // Generate tick values
    const tickValues = useMemo(() => getTicks(ticks, domain), [ticks, domain]);

    // Get error message for input validation
    const getErrorMsg = useCallback(
        (value: number, index: number, currentValues: number[]): string => {
            if (Number.isNaN(value)) {
                return 'Value should not be left blank';
            }
            if (value < domain[0] || value > domain[1]) {
                return `Value out of allowed range of ${domain[0]} - ${domain[1]}`;
            }
            if (
                (index > 0 && value < currentValues[index - 1]) ||
                (index < currentValues.length - 1 && value > currentValues[index + 1])
            ) {
                return 'Values have to be in ascending order';
            }
            return '';
        },
        [domain]
    );

    const adjustedLabel = ariaLabel ?? 'Slider';

    const renderTrackContent = useCallback(
        (renderProps: SliderTrackRenderProps) => {
            const { state } = renderProps;
            const currentValues = state.values;

            return (
                <>
                    {/* Rail */}
                    <SliderRail data-testid="rail" />

                    {/* Track segments */}
                    {(() => {
                        const segments = [];
                        const sortedIndices = Array.from({ length: currentValues.length }, (_, i) => i).sort(
                            (a, b) => currentValues[a] - currentValues[b]
                        );

                        // Track to start
                        if (trackToStart && sortedIndices.length > 0) {
                            const firstIndex = sortedIndices[0];
                            const startPercent = 0;
                            const endPercent = state.getThumbPercent(firstIndex) * 100;

                            segments.push(
                                <Track
                                    key="track-start"
                                    data-testid="track-start"
                                    style={{
                                        left: `${startPercent}%`,
                                        width: `${endPercent - startPercent}%`,
                                    }}
                                />
                            );
                        }

                        // Tracks between thumbs
                        for (let i = 0; i < sortedIndices.length - 1; i++) {
                            const startIndex = sortedIndices[i];
                            const endIndex = sortedIndices[i + 1];
                            const startPercent = state.getThumbPercent(startIndex) * 100;
                            const endPercent = state.getThumbPercent(endIndex) * 100;

                            segments.push(
                                <Fragment key={`track-${i}`}>
                                    <Track
                                        data-testid={`track-${i}`}
                                        style={{
                                            left: `${startPercent}%`,
                                            width: `${endPercent - startPercent}%`,
                                        }}
                                    />
                                    {trackLabels && trackLabels[i] && (
                                        <TrackLabel
                                            data-testid={`track-label-${i}`}
                                            style={{
                                                display: endPercent - startPercent === 0 ? 'none' : 'flex',
                                                left: `${(endPercent + startPercent) / 2}%`,
                                            }}
                                        >
                                            <span>{trackLabels[i]}</span>
                                        </TrackLabel>
                                    )}
                                </Fragment>
                            );
                        }

                        // Track to end
                        if (trackToEnd && sortedIndices.length > 0) {
                            const lastIndex = sortedIndices[sortedIndices.length - 1];
                            const startPercent = state.getThumbPercent(lastIndex) * 100;
                            const endPercent = 100;

                            segments.push(
                                <Track
                                    key="track-end"
                                    data-testid="track-end"
                                    style={{
                                        left: `${startPercent}%`,
                                        width: `${endPercent - startPercent}%`,
                                    }}
                                />
                            );
                        }

                        return segments;
                    })()}

                    {/* Thumbs */}
                    {currentValues.map((value, index) => (
                        <Tooltip
                            content={getValueLabel(value)}
                            hideOnClick={false}
                            interactive
                            key={index}
                            placement="top"
                        >
                            <StyledSliderThumb
                                aria-label={
                                    thumbLabels?.[index] ??
                                    (getValueLabel?.(value) as string | undefined) ??
                                    `Thumb ${index + 1}`
                                }
                                index={index}
                                data-testid={`handle-${index}`}
                                hasTicks={!!ticks}
                            />
                        </Tooltip>
                    ))}
                </>
            );
        },
        [trackToStart, trackToEnd, ticks, trackLabels, getValueLabel, thumbLabels]
    );

    return (
        <SliderWrapper className={className}>
            <SliderInner>
                <StyledSlider
                    aria-label={adjustedLabel}
                    minValue={domain[0]}
                    maxValue={domain[1]}
                    step={adjustedStep}
                    value={isControlled ? safeControlledValues : undefined}
                    defaultValue={!isControlled ? defaultValue : undefined}
                    onChange={handleChange}
                    style={style}
                >
                    {showInputs && <SliderInputField getErrorMsg={getErrorMsg} thumbLabels={thumbLabels} />}
                    {!showInputs && (
                        <>
                            <StyledSliderTrack data-testid="slider-track">{renderTrackContent}</StyledSliderTrack>

                            {/* Render ticks */}
                            {tickValues.length > 0 && (
                                <SliderTicks>
                                    {tickValues.map(({ value: tickValue, percent }, idx) => {
                                        return (
                                            <Tick
                                                data-testid={`tick-${idx}`}
                                                key={idx}
                                                showLine={tickValue !== domain[0] && tickValue !== domain[1]}
                                                style={{
                                                    left: `${percent}%`,
                                                    transform: getTickTransform(idx, tickValues.length),
                                                }}
                                            >
                                                {getValueLabel(tickValue)}
                                            </Tick>
                                        );
                                    })}
                                </SliderTicks>
                            )}
                        </>
                    )}
                </StyledSlider>
            </SliderInner>
            {!disableInputAlternative && (
                <Tooltip content={showInputs ? 'Use Slider' : 'Use Input Alternative'}>
                    <SwapButton>
                        <SwapHorizontal onClick={() => setShowInputs((v) => !v)} size="2x" />
                    </SwapButton>
                </Tooltip>
            )}
        </SliderWrapper>
    );
}

/**
 *  A simple numeric slider, essentially the same as BaseSlider
 *
 * @param props - the component props
 */
export function Slider(props: BaseSliderProps<number>): JSX.Element {
    return <BaseSlider<number> {...props} getValueLabel={(val: number) => round(val, 4)} />;
}

export interface CategoricalSliderProps
    extends Omit<BaseSliderProps<string>, 'domain' | 'initialValue' | 'disableInputAlternative'> {
    /** The set of string values to have as options on the slider */
    domain: Array<string>;
    /** the initialValue of the slider */
    initialValue?: Array<string>;
}

/**
 * The Categorical slider component accepts an array of string values to use on the slider, e.g.
 *
 * domain = ['low', 'med', 'high']
 *
 * @param {BaseSliderProps<string>} props - the component props
 */
export function CategoricalSlider(props: CategoricalSliderProps): JSX.Element {
    const initialValue = props.initialValue?.map((val) => props.domain.indexOf(val)) || [0];

    return (
        <BaseSlider<string>
            {...{
                ...props,
                domain: [0, props.domain.length - 1],
                initialValue,
                step: 1,
                ticks: Array.from(Array(props.domain.length).keys()),
            }}
            getValueLabel={(val: number) => props.domain[val]}
        />
    );
}
