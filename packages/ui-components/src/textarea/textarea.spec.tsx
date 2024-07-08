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

import TextArea, { TextAreaProps } from './textarea';

const keyDownFilter = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.key !== 'A' && e.key !== 'b') {
        return true;
    }
    return false;
};

function RenderTextArea(props: TextAreaProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <TextArea {...props} />
        </ThemeProvider>
    );
}

describe('TextArea', () => {
    it('should display correctly', () => {
        const { getByRole } = render(<RenderTextArea />);

        const textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toBeInTheDocument();
        expect(textarea.tagName).toEqual('TEXTAREA');
    });
    it('respects the initial value and tracks the selected value internally', () => {
        const onChangeStub = jest.fn();
        const { getByRole } = render(<RenderTextArea onChange={onChangeStub} />);
        // Empty initial string, function not called
        const textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveValue('');
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        // Now update the value
        fireEvent.change(textarea, { target: { value: 'New String' } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        const textareaUpdated = getByRole('textbox', { hidden: true });
        expect(textareaUpdated).toHaveValue('New String');
    });
    it('enters controlled mode when value is passed in', () => {
        const onChangeStub = jest.fn((value) => value);
        const { getByRole, rerender } = render(<RenderTextArea onChange={onChangeStub} value="Initial String" />);
        // Check initial value
        const textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveValue('Initial String');
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        // Call update, check function call, check value remains unchanged
        fireEvent.change(textarea, { target: { value: 'Updated String' } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        expect(onChangeStub.mock.results[0].value).toEqual('Updated String');
        const textAreaUnchanged = getByRole('textbox', { hidden: true });
        expect(textAreaUnchanged).toHaveValue('Initial String');
        // Rerender with a different initial value, check it updates
        rerender(<RenderTextArea onChange={onChangeStub} value="Updated String" />);
        const textAreaUpdated = getByRole('textbox', { hidden: true });
        expect(textAreaUpdated).toHaveValue('Updated String');
    });

    it('acts as expected when disabled', async () => {
        const onClickStub = jest.fn();
        const onChangeStub = jest.fn();
        const { getByRole, rerender } = render(
            <RenderTextArea disabled onChange={onChangeStub} onClick={onClickStub} />
        );
        // Check it is disabled
        const textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveAttribute('disabled');
        expect(textarea).toHaveStyle(`background-color: ${theme.colors.grey1}`);
        expect(textarea).toHaveStyle(`color: ${theme.colors.grey2}`);
        // Check it cannot be clicked
        fireEvent.click(getByRole('textbox', { hidden: true }));
        await waitFor(() => getByRole('textbox', { hidden: true }));
        expect(onClickStub).toHaveBeenCalledTimes(0);
        // Check its value cannot be changed
        userEvent.type(textarea, 'Updated String');
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        const textareaUpdated = getByRole('textbox', { hidden: true });
        expect(textareaUpdated).toHaveValue('');
        // Rerender and ensure it is still disabled
        rerender(<RenderTextArea disabled onChange={onChangeStub} onClick={onClickStub} />);
        const textareaRerender = getByRole('textbox', { hidden: true });
        expect(textareaRerender).toHaveAttribute('disabled');
        expect(textareaRerender).toHaveStyle(`background-color: ${theme.colors.grey1}`);
        expect(textareaRerender).toHaveStyle(`color: ${theme.colors.grey2}`);
    });
    it('placeholder value works as expected', () => {
        const onChangeStub = jest.fn();
        const { getByRole } = render(<RenderTextArea onChange={onChangeStub} placeholder="Placeholder String" />);
        // Check placeholder value
        const textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveAttribute('placeholder', 'Placeholder String');
        // Check initial value unset
        expect(textarea).toHaveValue('');
        // Check onChange function uncalled
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        // Update and check value, check onChange called
        fireEvent.change(textarea, { target: { value: 'Updated String' } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        const textareaUpdated = getByRole('textbox', { hidden: true });
        expect(textareaUpdated).toHaveValue('Updated String');
    });
    it('displays error messages correctly', async () => {
        const { getByRole, getByText } = render(<RenderTextArea errorMsg="Error" />);
        // Check the error boundary on the textarea
        const textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveStyle(`border: 1px solid ${theme.colors.error}`);
        // Check tooltip is displayed and it's errorMsg
        fireEvent.mouseEnter(getByRole('textbox', { hidden: true }));
        await waitFor(() => getByText('Error'));
        expect(getByText('Error')).toBeInTheDocument();
    });
    it('applies the keyDownFilter correctly', () => {
        const onChangeStub = jest.fn();
        const { getByRole } = render(<RenderTextArea keydownFilter={keyDownFilter} onChange={onChangeStub} />);

        let textarea = getByRole('textbox', { hidden: true });
        // Type A, should not fire
        userEvent.type(textarea, 'A');
        expect(onChangeStub).toHaveBeenCalledTimes(0);
        textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveValue('');
        // Type a, should fire
        userEvent.type(textarea, 'a');
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveValue('a');
        // Type B, should fire
        userEvent.type(textarea, 'B');
        expect(onChangeStub).toHaveBeenCalledTimes(2);
        textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveValue('aB');
        // Type b, should not fire
        userEvent.type(textarea, 'b');
        expect(onChangeStub).toHaveBeenCalledTimes(2);
        textarea = getByRole('textbox', { hidden: true });
        expect(textarea).toHaveValue('aB');
    });
    it('fires onComplete as expected', () => {
        const onChangeStub = jest.fn((value) => value);
        const onCompleteStub = jest.fn();
        const { getByRole } = render(
            <RenderTextArea keydownFilter={keyDownFilter} onChange={onChangeStub} onComplete={onCompleteStub} />
        );
        // Check hitting enter calls the onComplete function
        const textarea = getByRole('textbox', { hidden: true });
        userEvent.type(textarea, '{enter}');
        expect(onCompleteStub).toHaveBeenCalledTimes(1);
        // Check value update and hitting enter calls onChange and onComplete
        fireEvent.change(textarea, { target: { value: 'Updated String' } });
        userEvent.type(textarea, '{enter}');
        expect(onChangeStub.mock.results[1].value).toEqual('Updated String');
        expect(onCompleteStub).toHaveBeenCalledTimes(2);
        expect(onChangeStub).toHaveBeenCalledTimes(3);
    });
});
