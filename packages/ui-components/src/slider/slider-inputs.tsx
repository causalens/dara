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
import { FunctionComponent, useCallback, useRef } from 'react';

import styled from '@darajs/styled-components';
import { useIntersectionObserver } from '@darajs/ui-utils';

import NumericInput from '../numeric-input/numeric-input';

interface InputWrapperProps {
    firstInputVisible: boolean;
    lastInputVisible: boolean;
}

const InputWrapper = styled.div<InputWrapperProps>`
    position: relative;
    display: flex;
    flex: 1 1 auto;
    height: 3rem;

    div {
        flex: 1 1 auto;
    }

    input {
        height: 100%;

        ::before {
            content: ' ';

            position: sticky;
            top: 0;
            left: 0;

            width: ${(props) => (!props.firstInputVisible ? '8px' : 0)};
            height: 2.5rem;
        }

        ::after {
            content: '';

            position: sticky;
            top: 0;
            right: 0;

            width: ${(props) => (!props.lastInputVisible ? '8px' : 0)};
            height: 2.5rem;
        }
    }
`;

interface SliderInputsProps {
    /** The domain defines the range of possible values that the slider can take */
    domain: [number, number];
    /** The error message callback for inputs when value is out of domain range */
    getErrorMsg: (value: number, index: number) => string;
    /** Slider Values state setter */
    setSliderValues: React.Dispatch<React.SetStateAction<number[]>>;
    /** Slider Values */
    sliderValues: number[];
}

/**
 * The SliderInputs component displays the actual input values of the slider in a horizontal scrollable view
 * that can be edited and have the changes reflected on the slider.
 *
 * @param {SliderInputsProps} props - the props for the component
 */
const SliderInputs: FunctionComponent<SliderInputsProps> = ({
    getErrorMsg,
    sliderValues,
    setSliderValues,
    domain,
}): JSX.Element => {
    const firstInputRef = useRef();
    const lastInputRef = useRef();

    const firstInputVisible = useIntersectionObserver(firstInputRef, '0px', 0.5);
    const lastInputVisible = useIntersectionObserver(lastInputRef, '0px', 0.5);

    const onInputChange = useCallback(
        (value: number, index: number): void => {
            setSliderValues((currSliderValues) => {
                const updatedValues = [...currSliderValues];
                updatedValues[index] = Number.isNaN(value) ? domain[0] : value;
                return updatedValues;
            });
        },
        [domain, setSliderValues]
    );

    return (
        <InputWrapper firstInputVisible={firstInputVisible} lastInputVisible={lastInputVisible}>
            {sliderValues.map((value, index) => {
                let inputRef = null;
                if (index === 0) {
                    inputRef = firstInputRef;
                }
                if (index === sliderValues.length - 1) {
                    inputRef = lastInputRef;
                }
                return (
                    <div key={index} ref={inputRef}>
                        <NumericInput
                            errorMsg={getErrorMsg(value, index)}
                            onChange={(val) => onInputChange(val, index)}
                            style={{ height: '2rem', margin: '0.25rem 0.5rem' }}
                            value={value}
                        />
                    </div>
                );
            })}
        </InputWrapper>
    );
};

export default SliderInputs;
