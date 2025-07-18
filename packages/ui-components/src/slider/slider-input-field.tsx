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
import { type FunctionComponent, useContext } from 'react';
import { SliderStateContext } from 'react-aria-components';

import styled from '@darajs/styled-components';

import NumericInput from '../numeric-input/numeric-input';

const InputList = styled.div`
    position: relative;

    overflow-x: auto;
    display: flex;
    flex: 1;
    gap: 0.25rem;

    min-width: 0;
`;

const InputWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
`;

const InputLabel = styled.span`
    font-size: 0.825rem;
    color: ${(props) => props.theme.colors.grey4};
`;

interface SliderInputsProps {
    /** The error message callback for inputs when value is out of domain range */
    getErrorMsg: (value: number, index: number, currentValues: number[]) => string;
    /** An optional set of labels to display for the thumbs */
    thumbLabels?: string[];
}

/**
 * The SliderInputs component displays the actual input values of the slider in a horizontal scrollable view
 * that can be edited and have the changes reflected on the slider.
 */
const SliderInputField: FunctionComponent<SliderInputsProps> = ({ getErrorMsg, thumbLabels }): JSX.Element => {
    const state = useContext(SliderStateContext);

    if (!state) {
        throw new Error('SliderStateContext is not available, SliderInputField must be used within a Slider component');
    }

    return (
        <InputList>
            {state.values.map((value, index) => {
                return (
                    <InputWrapper key={index}>
                        <NumericInput
                            errorMsg={getErrorMsg(value, index, state.values)}
                            onChange={(val) => {
                                state.setThumbValue(index, val);
                            }}
                            value={value}
                            stepper
                            stepSkip={state.step}
                            minValue={state.getThumbMinValue(index)}
                            maxValue={state.getThumbMaxValue(index)}
                        />
                        <InputLabel>{thumbLabels?.[index] ?? `Thumb ${index + 1}`}</InputLabel>
                    </InputWrapper>
                );
            })}
        </InputList>
    );
};

export default SliderInputField;
