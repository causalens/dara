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
import isEqual from 'lodash/isEqual';
import round from 'lodash/round';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handles, Slider as RCSlider, Rail, Ticks, Tracks } from 'react-compound-slider';

import styled from '@darajs/styled-components';
import { SwapHorizontal } from '@darajs/ui-icons';
import { useDeepCompare } from '@darajs/ui-utils';

import Tooltip from '../tooltip/tooltip';
import { InteractiveComponentProps } from '../types';
import SliderInputs from './slider-inputs';

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
    overflow: hidden;
    display: flex;
    width: 100%;
`;

const StyledSlider = styled(RCSlider)`
    position: relative;

    display: inline-flex;
    flex-direction: column;
    justify-content: center;

    width: 100%;
    height: 3rem;
    margin: 0 1rem;
`;

const SliderRail = styled.div`
    cursor: pointer;

    width: 100%;
    height: 0.25rem;
    padding: 0 0.3rem;

    background-color: ${(props) => props.theme.colors.grey2};
    border-radius: 0.125rem;
`;

interface HasTicksProp {
    hasTicks: boolean;
}

const Handle = styled.span<HasTicksProp>`
    cursor: pointer;

    position: absolute;
    z-index: 2;

    width: 1rem;
    height: 1rem;
    margin-top: ${(props) => (props.hasTicks ? '-0.5rem' : '0')};
    margin-left: -0.6rem;

    background-color: ${(props) => props.theme.colors.primary};
    border-radius: 50%;
`;

const Track = styled.span<HasTicksProp>`
    position: absolute;

    height: 0.25rem;
    margin-top: ${(props) => (props.hasTicks ? '-0.5rem' : '0')};

    background-color: ${(props) => props.theme.colors.primary};
    border-radius: 0.125rem;
`;

const TrackLabel = styled.span`
    position: absolute;
    z-index: 1;
    top: -0.3rem;
    color: ${(props) => props.theme.colors.grey6};
`;

const LabelInner = styled.span`
    margin-left: -50%;
    line-height: 1.5rem;
`;

const SliderTicks = styled.div`
    position: relative;
    margin-top: 0.5rem;
`;

interface TickProps {
    showLine: boolean;
}

const Tick = styled.span<TickProps>`
    position: absolute;
    font-size: 0.875rem;
    color: ${(props) => props.theme.colors.grey6};

    &${(props) => (props.showLine ? '' : ':not(:first-child):not(:last-child)')}::before {
        content: '';

        position: absolute;
        z-index: 1;
        left: 50%;

        display: block;

        width: 0.125rem;
        height: 0.125rem;
        margin-top: -0.685rem;

        background-color: ${(props) => props.theme.colors.grey3};
        border-radius: 50%;
    }
`;

const SwapButtonWrapper = styled.div`
    display: flex;
    height: fit-content;
    margin-top: 0.3rem;
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

export interface BaseSliderProps<T> extends InteractiveComponentProps<Array<number>> {
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
 * The BaseSlider component forms the basis for the other sliders. It wraps the thirdparty react-compound-slider library
 * and adds a simple UI to the component, with support for multiple handle sliders. It accepts a domain property that
 * defines the range of the slider and can be further tweaked by passing the step and ticks parameters which adjust the
 * step size and control the display of ticks respectively.
 *
 * The number of handles is controlled by the number of values passed to the values array. A single value will create a
 * single handle and two will create 2, etc... The trackToStart and trackToEnd properties can be used to define whether
 * the tracks to the left and right most handles are filled to the end or not. By default trackToStart is true.
 *
 * @param {BaseSliderProps} props - the props for the component
 */
function BaseSlider<T extends string | number | React.ReactNode>({
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

    const [sliderValues, setSliderValues] = useState(
        values?.map((v) => mapToClosestStep(v, adjustedStep)) ||
            initialValue?.map((v) => mapToClosestStep(v, adjustedStep)) || [domain[0]]
    );
    const currSliderValues = useRef(sliderValues);
    currSliderValues.current = sliderValues;

    const isFirstRender = useRef(true);

    useEffect(() => {
        if (values !== undefined) {
            const mappedValues = values.map((v) => mapToClosestStep(v, adjustedStep));

            if (!isEqual(mappedValues, currSliderValues.current)) {
                setSliderValues(mappedValues);
            }
        }
    }, [adjustedStep, values]);

    const [showInputs, setShowInputs] = useState(false);

    const precision = useMemo(
        () => (Math.floor(adjustedStep) === adjustedStep ? 0 : adjustedStep.toString().split('.')[1].length || 0),
        [adjustedStep]
    );

    // Get the error message for inputs when value is out of domain range
    const getErrorMsg = useCallback(
        (value: number, index: number): string => {
            if (Number.isNaN(value)) {
                return 'Value should not be left blank';
            }
            if (value < domain[0] || value > domain[1]) {
                return `Value out of allowed range of ${domain[0]} - ${domain[1]}`;
            }
            if (
                (index > 0 && value < sliderValues[index - 1]) ||
                (index < sliderValues.length - 1 && value > sliderValues[index + 1])
            ) {
                return 'Values have to be in ascending order';
            }
            return '';
        },
        [domain, sliderValues]
    );

    // Validate values are in order and in range
    const validateValues = useCallback(
        (value: number[]): boolean => {
            for (let index = 0; index < value.length; index++) {
                if (getErrorMsg(value[index], index) !== '') {
                    return false;
                }
            }
            return true;
        },
        [getErrorMsg]
    );

    useEffect(
        () => {
            if (isFirstRender.current) {
                isFirstRender.current = false;
                return;
            }
            if (validateValues(sliderValues)) {
                const formattedValues = sliderValues.map(getValueLabel);
                onChange?.(formattedValues);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        useDeepCompare([sliderValues])
    );

    const onSliderChange = useCallback(
        (value: Array<number>): void => {
            setSliderValues(value.map((val) => parseFloat(val.toFixed(precision))));
        },
        [precision]
    );

    const tickProps = typeof ticks === 'number' ? { count: ticks } : { values: ticks };

    return (
        <SliderWrapper className={className}>
            <SliderInner>
                {showInputs ?
                    <SliderInputs
                        domain={domain}
                        getErrorMsg={getErrorMsg}
                        setSliderValues={setSliderValues}
                        sliderValues={sliderValues}
                    />
                :   <StyledSlider
                        domain={domain}
                        onChange={onSliderChange}
                        rootStyle={style}
                        step={adjustedStep}
                        values={sliderValues}
                    >
                        <Rail>{({ getRailProps }) => <SliderRail {...getRailProps()} data-testid="rail" />}</Rail>
                        <Handles>
                            {({ handles, getHandleProps }) => (
                                <>
                                    {handles.map((handle, idx) => (
                                        <Tooltip
                                            content={getValueLabel(handle.value)}
                                            hideOnClick={false}
                                            interactive
                                            key={handle.id}
                                            placement="top"
                                        >
                                            <Handle
                                                {...getHandleProps(handle.id)}
                                                data-testid={`handle-${idx}`}
                                                hasTicks={!!ticks}
                                                style={{ left: `${handle.percent}%` }}
                                            />
                                        </Tooltip>
                                    ))}
                                </>
                            )}
                        </Handles>
                        <Tracks left={trackToStart} right={trackToEnd}>
                            {({ tracks, getTrackProps }) => (
                                <>
                                    {tracks.map(({ id, source, target }, idx) => (
                                        <Fragment key={id}>
                                            <Track
                                                hasTicks={!!ticks}
                                                key={id}
                                                {...getTrackProps()}
                                                data-testid={`track-${idx}`}
                                                style={{
                                                    left: `${source.percent}%`,
                                                    width: `${target.percent - source.percent}%`,
                                                }}
                                            />
                                            {trackLabels && trackLabels.length > 0 && (
                                                <TrackLabel
                                                    data-testid={`track-label-${idx}`}
                                                    key={`label_${id}`}
                                                    style={{
                                                        display:
                                                            target.percent - source.percent === 0 ? 'none' : 'flex',
                                                        left: `${
                                                            (target.percent - source.percent) / 2 + source.percent
                                                        }%`,
                                                    }}
                                                >
                                                    <LabelInner>{trackLabels[idx]}</LabelInner>
                                                </TrackLabel>
                                            )}
                                        </Fragment>
                                    ))}
                                </>
                            )}
                        </Tracks>
                        {ticks && (
                            <Ticks {...tickProps}>
                                {({ ticks: sliderTicks }) => (
                                    <SliderTicks>
                                        {sliderTicks.map((tick, idx) => (
                                            <Tick
                                                data-testid={`tick-${idx}`}
                                                key={tick.id}
                                                showLine={tick.value !== domain[0] && tick.value !== domain[1]}
                                                style={{
                                                    left: `${tick.percent}%`,
                                                    transform: getTickTransform(idx, sliderTicks.length),
                                                }}
                                            >
                                                {getValueLabel(tick.value)}
                                            </Tick>
                                        ))}
                                    </SliderTicks>
                                )}
                            </Ticks>
                        )}
                    </StyledSlider>
                }
            </SliderInner>
            {!disableInputAlternative && sliderValues && (
                <Tooltip content={showInputs ? 'Use Slider?' : 'Use Input Alternative?'} placement="top">
                    <SwapButtonWrapper>
                        <SwapHorizontal asButton onClick={() => setShowInputs(!showInputs)} size="2x" />
                    </SwapButtonWrapper>
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
    return (
        <BaseSlider<number>
            disableInputAlternative={props.disableInputAlternative}
            {...props}
            getValueLabel={(val: number) => round(val, 4)}
        />
    );
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
