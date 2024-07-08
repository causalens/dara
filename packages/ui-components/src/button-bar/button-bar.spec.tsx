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

import { ThemeProvider, theme } from '@darajs/styled-components';

import { Item } from '../types';
import ButtonBar, { ButtonProps } from './button-bar';

const items: Array<Item> = [
    {
        label: 'Button 1',
        value: 'button1',
    },
    {
        label: 'Button 2',
        value: 'button2',
    },
    {
        label: 'Button 3',
        value: 'button3',
    },
];

function RenderButtonBar(props: ButtonProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <ButtonBar {...props} />
        </ThemeProvider>
    );
}

describe('ButtonBar', () => {
    it('should display correctly', () => {
        const { getAllByRole } = render(<RenderButtonBar items={items} />);

        const buttons = getAllByRole('button', { hidden: true });
        expect(buttons.length).toEqual(3);
        buttons.forEach((button, index) => {
            expect(button.innerHTML).toEqual(items[index].label);
        });
    });

    it('controlled mode - value is defined externally', () => {
        const onSelectStub = jest.fn();
        const { getAllByRole } = render(
            <RenderButtonBar items={items} onSelect={onSelectStub} value={{ label: 'Button 2', value: 'button2' }} />
        );

        let buttons = getAllByRole('button', { hidden: true });

        // Check that onSelect has not been called on the initial render
        expect(onSelectStub).toHaveBeenCalledTimes(0);

        // Second button should be selected
        expect(buttons[0]).toHaveAttribute('aria-selected', 'false');
        expect(buttons[1]).toHaveAttribute('aria-selected', 'true');
        expect(buttons[2]).toHaveAttribute('aria-selected', 'false');

        // Click on first button - check onSelect is called with correct value
        fireEvent.click(getAllByRole('button', { hidden: true })[0]);
        expect(onSelectStub).toHaveBeenCalledWith({ label: 'Button 1', value: 'button1' });

        // After clicking - second button should remain unchanged
        buttons = getAllByRole('button', { hidden: true });
        expect(buttons[0]).toHaveAttribute('aria-selected', 'false');
        expect(buttons[1]).toHaveAttribute('aria-selected', 'true');
        expect(buttons[2]).toHaveAttribute('aria-selected', 'false');
    });

    it('uncontrolled mode value should be tracked internally', () => {
        const onSelectStub = jest.fn();
        const { getAllByRole } = render(
            <RenderButtonBar initialValue={{ label: 'Button 2', value: 'button2' }} items={items} />
        );

        let buttons = getAllByRole('button', { hidden: true });

        // Check that onSelect has not been called on the initial render
        expect(onSelectStub).toHaveBeenCalledTimes(0);

        // Second button should be selected
        expect(buttons[0]).toHaveAttribute('aria-selected', 'false');
        expect(buttons[1]).toHaveAttribute('aria-selected', 'true');
        expect(buttons[2]).toHaveAttribute('aria-selected', 'false');

        // Click on first button - check onSelect is not called
        fireEvent.click(getAllByRole('button', { hidden: true })[0]);
        expect(onSelectStub).toHaveBeenCalledTimes(0);

        // After clicking - first button should be selected
        buttons = getAllByRole('button', { hidden: true });
        expect(buttons[0]).toHaveAttribute('aria-selected', 'true');
        expect(buttons[1]).toHaveAttribute('aria-selected', 'false');
        expect(buttons[2]).toHaveAttribute('aria-selected', 'false');

        // Click on third button - check onSelect is called
        fireEvent.click(getAllByRole('button', { hidden: true })[2]);
        expect(onSelectStub).toHaveBeenCalledTimes(0);

        // After clicking - third button should be selected
        buttons = getAllByRole('button', { hidden: true });
        expect(buttons[0]).toHaveAttribute('aria-selected', 'false');
        expect(buttons[1]).toHaveAttribute('aria-selected', 'false');
        expect(buttons[2]).toHaveAttribute('aria-selected', 'true');
    });

    it('should support the disabled prop', async () => {
        const onSelectStub = jest.fn();
        const { getAllByRole, rerender } = render(<RenderButtonBar disabled items={items} onSelect={onSelectStub} />);

        let buttons = getAllByRole('button', { hidden: true });

        // Check that the buttons are disabled
        expect(buttons[0]).toHaveAttribute('disabled');
        expect(buttons[1]).toHaveAttribute('disabled');
        expect(buttons[2]).toHaveAttribute('disabled');

        // Check that the first value is only selected
        expect(buttons[0]).toHaveStyle(`background-color: ${theme.colors.grey2}`);
        expect(buttons[1]).toHaveStyle(`background-color: ${theme.colors.blue1}`);
        expect(buttons[2]).toHaveStyle(`background-color: ${theme.colors.blue1}`);

        // Click Second Button, onSelect should not be called
        fireEvent.click(getAllByRole('button', { hidden: true })[1]);
        await waitFor(() => getAllByRole('button', { hidden: true })[1]);
        // The no of clicks are 1 here as the onSelect gets called on initial render
        expect(onSelectStub).toHaveBeenCalledTimes(0);

        // Check that the first value is still selected
        buttons = getAllByRole('button', { hidden: true });
        expect(buttons[0]).toHaveStyle(`background-color: ${theme.colors.grey2}`);
        expect(buttons[1]).toHaveStyle(`background-color: ${theme.colors.blue1}`);
        expect(buttons[2]).toHaveStyle(`background-color: ${theme.colors.blue1}`);

        // Re-render a disabled button bar to check color again
        rerender(<RenderButtonBar disabled items={items} onSelect={onSelectStub} />);

        buttons = getAllByRole('button', { hidden: true });

        // Check that the buttons are disabled
        expect(buttons[0]).toHaveAttribute('disabled');
        expect(buttons[1]).toHaveAttribute('disabled');
        expect(buttons[2]).toHaveAttribute('disabled');

        // Check that the first value is only selected
        expect(buttons[0]).toHaveStyle(`background-color: ${theme.colors.grey2}`);
        expect(buttons[1]).toHaveStyle(`background-color: ${theme.colors.blue1}`);
        expect(buttons[2]).toHaveStyle(`background-color: ${theme.colors.blue1}`);
    });
});
