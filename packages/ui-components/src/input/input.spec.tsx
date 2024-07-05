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
import { fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import Input, { InputProps } from './input';

const keyDownFilter = (e: React.KeyboardEvent<HTMLInputElement>): boolean => {
    if (e.key !== 'e' && e.key !== 'A') {
        return true;
    }
    return false;
};

function RenderInput(props: InputProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Input {...props} />
        </ThemeProvider>
    );
}

describe('Input', () => {
    it('should display correctly', () => {
        const { getByRole } = render(<RenderInput />);

        const input = getByRole('textbox', { hidden: true });
        expect(input).toBeInTheDocument();
        expect(input).toHaveAttribute('type', 'text');
    });

    it('should track value internally and have blank initial value', () => {
        const onChangeStub = jest.fn();
        const { getByRole } = render(<RenderInput onChange={onChangeStub} />);

        let input = getByRole('textbox', { hidden: true });

        // Initial Value should be blank and onChange should not have been called
        expect(input).toHaveValue('');
        expect(onChangeStub).toHaveBeenCalledTimes(0);

        // Change the value and check that onChange has been called
        fireEvent.change(input, { target: { value: 'Test Value' } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);

        // Check if the new value was updated
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('Test Value');
    });

    it('should respect initial value and be in controlled mode', () => {
        const onChangeStub = jest.fn((value) => value);
        const { getByRole, rerender } = render(<RenderInput onChange={onChangeStub} value="Test Value" />);

        let input = getByRole('textbox', { hidden: true });

        // Check that initial value is respected
        expect(input).toHaveValue('Test Value');
        expect(onChangeStub).toHaveBeenCalledTimes(0);

        // Check that firing a change event calls the onChange function with the updated value
        fireEvent.change(input, { target: { value: 'Updated Value' } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        expect(onChangeStub.mock.results[0].value).toEqual('Updated Value');

        // Check that the value in Input remains the same
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('Test Value');

        // Check that only changing the value through props changes the value
        rerender(<RenderInput onChange={onChangeStub} value="Updated Value" />);
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('Updated Value');
    });

    it('should support the disabled prop', async () => {
        const onClickStub = jest.fn();
        const onChangeStub = jest.fn();
        const { getByRole, rerender } = render(<RenderInput disabled onChange={onChangeStub} onClick={onClickStub} />);

        let input = getByRole('textbox', { hidden: true });

        // Check that the input is disabled
        expect(input).toHaveAttribute('disabled');
        expect(input).toHaveStyle(`background-color: ${theme.colors.grey1}`);
        expect(input).toHaveStyle(`color: ${theme.colors.grey2}`);

        // Check that the input is not clickable
        fireEvent.click(getByRole('textbox', { hidden: true }));
        await waitFor(() => getByRole('textbox', { hidden: true }));
        expect(onClickStub).toHaveBeenCalledTimes(0);

        // Check that the input cannot be typed in
        userEvent.type(input, 'Test Text');
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('');

        // Re-render the input to check that the input is still disabled
        rerender(<RenderInput disabled onClick={onClickStub} />);

        input = getByRole('textbox', { hidden: true });

        // Check that the input is disabled
        expect(input).toHaveAttribute('disabled');
        expect(input).toHaveStyle(`background-color: ${theme.colors.grey1}`);
        expect(input).toHaveStyle(`color: ${theme.colors.grey2}`);
    });

    it('should work with placeholder', () => {
        const onChangeStub = jest.fn();
        const { getByRole } = render(<RenderInput onChange={onChangeStub} placeholder="Test Placeholder" />);

        let input = getByRole('textbox', { hidden: true });

        // Check that placeholder attribute is set correctly
        expect(input).toHaveAttribute('placeholder', 'Test Placeholder');

        // Initial Value should be blank and onChange should not have been called
        expect(input).toHaveValue('');
        expect(onChangeStub).toHaveBeenCalledTimes(0);

        // Change the value and check that onChange has been called
        fireEvent.change(input, { target: { value: 'Test Value' } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);

        // Check if the new value was updated
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('Test Value');
    });

    it('should respect errorMsg and show it as tooltip', async () => {
        const { getByRole, getByText } = render(<RenderInput errorMsg="Test Error" />);

        const input = getByRole('textbox', { hidden: true });

        // Check that input has an error boundary
        expect(input).toHaveStyle(`border: 1px solid ${theme.colors.error}`);

        // Check that the tooltip is displayed and the errorMsg is correct
        fireEvent.mouseEnter(getByRole('textbox', { hidden: true }));
        await waitFor(() => getByText('Test Error'));
        expect(getByText('Test Error')).toBeInTheDocument();
    });

    it('should respect the keyDownFilter', () => {
        const onChangeStub = jest.fn();
        const { getByRole } = render(<RenderInput keydownFilter={keyDownFilter} onChange={onChangeStub} />);

        let input = getByRole('textbox', { hidden: true });

        expect(input).toHaveValue('');

        // Click A, should not fire onChange and should not update the value
        userEvent.type(input, 'A');
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('');

        // Click b, should fire onChange and should update the value to b
        userEvent.type(input, 'b');
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('b');

        // Click e, should not fire onChange and should not update the value
        userEvent.type(input, 'e');
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('b');

        // Click O, should fire onChange and should update the value to bO
        userEvent.type(input, 'O');
        expect(onChangeStub).toHaveBeenCalledTimes(2);
        input = getByRole('textbox', { hidden: true });
        expect(input).toHaveValue('bO');
    });

    it('should fire onComplete correctly', () => {
        const onCompleteStub = jest.fn();
        const onChangeStub = jest.fn((value) => value);
        const { getByRole } = render(
            <RenderInput keydownFilter={keyDownFilter} onChange={onChangeStub} onComplete={onCompleteStub} />
        );

        const input = getByRole('textbox', { hidden: true });

        // Check that hitting enter calls the onComplete function
        userEvent.type(input, '{enter}');
        expect(onCompleteStub).toHaveBeenCalledTimes(1);

        /**
         * Check that setting some text and then hitting enter calls the onComplete function
         * and also sends the correct value to onChange function
         */
        fireEvent.change(input, { target: { value: 'Test Value' } });
        userEvent.type(input, '{enter}');
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        expect(onCompleteStub).toHaveBeenCalledTimes(2);
        expect(onChangeStub.mock.results[0].value).toEqual('Test Value');
    });
});
