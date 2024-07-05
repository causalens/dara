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

/* eslint-disable jest/no-disabled-tests */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import NumericInput, { NumericInputProps } from './numeric-input';

function RenderNumericInput(props: NumericInputProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <NumericInput {...props} />
        </ThemeProvider>
    );
}

describe('Numeric Input', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should only accept numeric input', async () => {
        const { getByRole, rerender } = render(<RenderNumericInput />);
        const input = getByRole('textbox', { hidden: true });

        // shouldn't accept text
        await userEvent.type(input, 'abcd', { delay: 1 });
        expect(input).toHaveValue('');

        // should accept integers
        await userEvent.type(input, '1234', { delay: 1 });
        expect(input).toHaveValue('1234');

        // should accept negative numbers
        userEvent.clear(input);
        await userEvent.type(input, '-1234', { delay: 1 });
        expect(input).toHaveValue('-1234');

        // should accept decimals
        userEvent.clear(input);
        await userEvent.type(input, '12.34', { delay: 1 });
        expect(input).toHaveValue('12.34');

        // should not accept decimals if integerOnly
        rerender(<RenderNumericInput integerOnly />);
        userEvent.clear(input);
        await userEvent.type(input, '12.34', { delay: 1 });
        expect(input).toHaveValue('1234');
    });

    it('should support the disabled prop for input', async () => {
        const onChangeStub = jest.fn();
        const { getByRole, getAllByRole } = render(
            <RenderNumericInput disabled initialValue={5} onChange={onChangeStub} stepper />
        );

        const input = getByRole('textbox', { hidden: true });
        const stepperButtons = getAllByRole('button');

        const stepUpButton = stepperButtons[0];
        const stepDownButton = stepperButtons[1];

        // Check that the input is disabled
        expect(input).toHaveAttribute('disabled');
        expect(input).toHaveStyle(`background-color: ${theme.colors.grey1}`);
        expect(input).toHaveStyle(`color: ${theme.colors.grey2}`);

        // Check that the input cannot be typed in
        await userEvent.type(input, '1234', { delay: 1 });
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        expect(input).toHaveValue('5');

        // Check that stepper cannot be used
        userEvent.click(stepDownButton);
        expect(input).toHaveValue('5');

        userEvent.click(stepUpButton);
        expect(input).toHaveValue('5');
    });

    it('should listen to changes to input', async () => {
        const onChangeStub = jest.fn((value) => value);

        const { getByRole } = render(<RenderNumericInput onChange={onChangeStub} value={2} />);
        const input = getByRole('textbox', { hidden: true });

        await userEvent.type(input, '1', { delay: 1 });
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        expect(onChangeStub.mock.results[0].value).toEqual(21);
    });

    it('should update the callback method with latest values', async () => {
        const onChangeStub = jest.fn((isChangeCalled, value) => [isChangeCalled, value]);

        function TestItem(): React.ReactNode {
            const [isButtonClicked, setIsButtonClicked] = React.useState<boolean>(false);

            const onChange = React.useCallback(
                (value: number): void => {
                    onChangeStub(isButtonClicked, value);
                },
                [isButtonClicked]
            );
            return (
                <div>
                    <RenderNumericInput onChange={onChange} value={2} />
                    <input onClick={() => setIsButtonClicked(true)} type="button" value="Click" />
                </div>
            );
        }

        const { getByRole } = render(<TestItem />);
        const input = getByRole('textbox', { hidden: true });

        // change it for the first time, the isButtonClicked value should still be false
        await act(async () => {
            await userEvent.type(input, '1', { delay: 1 });
        });

        // expect the mock to be called with the array result of [21, false]
        await waitFor(() => {
            expect(onChangeStub).toHaveBeenCalledTimes(1);
            expect(onChangeStub.mock.results[0].value[1]).toEqual(21);
            expect(onChangeStub.mock.results[0].value[0]).toEqual(false);
        });

        // fire the click on a different act to make sure it happens before the changes
        act(() => {
            fireEvent.click(screen.getByRole('button', { name: 'Click' }));
        });

        // click the button, the value should be true
        await act(async () => {
            await userEvent.type(input, '5', { delay: 1 });
        });

        // expect the mock to be called with the array result of [21, true] since we clicked the button
        await waitFor(() => {
            expect(onChangeStub).toHaveBeenCalledTimes(2);
            expect(onChangeStub.mock.results[1].value[1]).toEqual(25);
            expect(onChangeStub.mock.results[1].value[0]).toEqual(true);
        });
    });

    it('should pass keydown to the parent', async () => {
        const onKeydownStub = jest.fn((value) => value.key);

        const { getByRole } = render(<RenderNumericInput onKeyDown={onKeydownStub} value={2} />);
        const input = getByRole('textbox');

        act(() => {
            fireEvent.keyDown(input, { key: 'Enter' });
        });

        await waitFor(() => {
            expect(onKeydownStub).toHaveBeenCalledTimes(1);
            expect(onKeydownStub.mock.results[0].value).toEqual('Enter');
        });
    });

    it('should implement the stepper correctly', async () => {
        const { getByRole, getAllByRole } = render(<RenderNumericInput stepper />);
        const input = getByRole('textbox', { hidden: true });

        const stepperButtons = getAllByRole('button');
        expect(stepperButtons.length).toBe(2);

        const stepUpButton = stepperButtons[0];
        const stepDownButton = stepperButtons[1];

        await userEvent.type(input, '0', { delay: 1 });
        userEvent.click(stepDownButton);
        expect(input).toHaveValue('-1');

        userEvent.dblClick(stepUpButton);
        expect(input).toHaveValue('1');

        // should step up and step down via the appropriate keyboard events too
        userEvent.clear(input);
        await userEvent.type(input, '-0.1', { delay: 1 });

        await userEvent.type(input, '{arrowup}', { delay: 1 });
        expect(input).toHaveValue('0.0');

        await userEvent.type(input, '{arrowup}', { delay: 1 });
        expect(input).toHaveValue('0.1');

        await userEvent.type(input, '{arrowdown}', { delay: 1 });
        expect(input).toHaveValue('0.0');

        await userEvent.type(input, '{arrowdown}', { delay: 1 });
        expect(input).toHaveValue('-0.1');
    });

    it("should not step if input doesn't contain a valid number", async () => {
        const { getByRole, getAllByRole } = render(<RenderNumericInput stepper />);
        const input = getByRole('textbox', { hidden: true });

        const stepperButtons = getAllByRole('button');
        expect(stepperButtons.length).toBe(2);

        const stepDownButton = stepperButtons[1];

        // Nothing should happen if the input is empty
        userEvent.click(stepDownButton);
        expect(input).toHaveValue('');

        // Nothing should happen if the input is invalid
        await userEvent.type(input, '-', { delay: 1 });
        userEvent.click(stepDownButton);
        expect(input).toHaveValue('-');
    });
});
