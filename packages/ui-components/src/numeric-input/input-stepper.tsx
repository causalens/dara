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
import { FunctionComponent } from 'react';

import styled from '@darajs/styled-components';
import { ChevronDown, ChevronUp } from '@darajs/ui-icons';

import Button from '../button/button';

interface StepperWrapperProps {
    disabled: boolean;
}

const StepperWrapper = styled.div<StepperWrapperProps>`
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};

    display: flex;
    flex-direction: column;
    justify-content: space-around;

    box-sizing: border-box;
    padding: 0.25rem 0;

    border-radius: 0 0.25rem 0.25rem 0;
`;

const StepperButton = styled(Button)`
    min-width: 0.75rem;
    height: max-content;
    padding: 0;
    background-color: transparent !important;

    svg {
        cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
        width: 0.75rem;
        height: 0.75rem;
        color: ${(props) => (props.disabled ? props.theme.colors.grey3 : props.theme.colors.grey4)};
    }

    :hover:not(:disabled) {
        svg {
            color: ${(props) => props.theme.colors.grey5};
        }
    }

    :active:not(:disabled) {
        svg {
            transform: scale(0.75);
        }
    }
`;

interface InputStepperProps {
    /** property that disables the stepper */
    disabled: boolean;
    /** callback that determines the logic for increasing or decreasing input value */
    step: (value: number) => void;
    /** Optional property to set how many steps the stepper should take */
    stepSkip?: number;
}

/**
 * A simple stepper component that can be added to an input component to increase or decrease its value
 *
 * @param props the component props
 */

const InputStepper: FunctionComponent<InputStepperProps> = ({ disabled, step, stepSkip }) => {
    const amountToStep: number = Math.abs(stepSkip ?? 1);
    const stepUp = (): void => step(amountToStep);
    const stepDown = (): void => step(amountToStep * -1);

    return (
        <StepperWrapper disabled={disabled}>
            <StepperButton disabled={disabled} onClick={stepUp} styling="ghost" tabIndex={-1}>
                <ChevronUp />
            </StepperButton>

            <StepperButton disabled={disabled} onClick={stepDown} styling="ghost" tabIndex={-1}>
                <ChevronDown />
            </StepperButton>
        </StepperWrapper>
    );
};

export default InputStepper;
