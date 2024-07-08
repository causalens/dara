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

import { ThemeProvider, theme } from '@darajs/styled-components';

import Select, { SelectProps } from './select';

const items = [
    {
        label: 'Label 1',
        value: 'Value 1',
    },
    {
        label: 'Label 2',
        value: 'Value 2',
    },
    {
        label: 'Label 3',
        value: 'Value 3',
    },
    {
        label: 'Label 4',
        value: 'Value 4',
    },
    {
        label: 'Label 5',
        value: 'Value 5',
    },
];

function RenderSelect(props: SelectProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Select {...props} />
        </ThemeProvider>
    );
}

// The tests need to be wrapped in act since there are side effects when rendering (probably popper stuff)
/* eslint-disable @typescript-eslint/require-await */
describe('Select', () => {
    it('should display correctly', async () => {
        const { getByRole } = render(<RenderSelect items={items} />);

        // Check that the button is in the document and with correct text
        const select = getByRole('combobox', { hidden: true });
        expect(select).toBeInTheDocument();
        expect(select).toHaveAttribute('aria-haspopup', 'listbox');
        expect(select).toHaveTextContent('Select');

        // Check that the chevron is rendered correctly
        const chevron = getByRole('img', { hidden: true });
        expect(chevron.tagName).toEqual('svg');
        expect(chevron.classList).toContain('fa-chevron-down');
    });

    it('should display options correctly', async () => {
        const { getByRole } = render(<RenderSelect items={items} />);

        const select = getByRole('combobox', { hidden: true });
        let options = getByRole('listbox', { hidden: true });

        // All the options are in the document on render
        expect(options).toBeInTheDocument();

        // The options are currently not displayed
        expect(options).toHaveStyle('display: none');

        // All options have correct labels
        expect(options.children.length).toEqual(5);
        expect(options.children[0].textContent).toEqual('Label 1');
        expect(options.children[1].textContent).toEqual('Label 2');
        expect(options.children[2].textContent).toEqual('Label 3');
        expect(options.children[3].textContent).toEqual('Label 4');
        expect(options.children[4].textContent).toEqual('Label 5');

        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));

        options = getByRole('listbox', { hidden: true });

        // All options should still be in the documents
        expect(options).toBeInTheDocument();

        // All options should now be visible
        expect(options).toHaveStyle('display: flex');

        // All options have correct labels
        expect(options.children.length).toEqual(5);
        expect(options.children[0].textContent).toEqual('Label 1');
        expect(options.children[1].textContent).toEqual('Label 2');
        expect(options.children[2].textContent).toEqual('Label 3');
        expect(options.children[3].textContent).toEqual('Label 4');
        expect(options.children[4].textContent).toEqual('Label 5');

        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));
        options = getByRole('listbox', { hidden: true });

        // All options are still in the document
        expect(options).toBeInTheDocument();

        // All options are again not displayed
        expect(options).toHaveStyle('display: none');
    });

    it('should respect initialIsOpen and open dropdown on initial render', async () => {
        const { getByRole } = render(<RenderSelect initialIsOpen items={items} />);

        const select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Select');

        // The options should be displayed on render
        let options = getByRole('listbox', { hidden: true });
        expect(options).toHaveStyle('display: flex');

        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));

        // The options should now not be displayed
        options = getByRole('listbox', { hidden: true });
        expect(options).toHaveStyle('display: none');
    });

    it('should track selected item internally', async () => {
        const onSelectStub = jest.fn((value) => value);
        const { getByRole } = render(<RenderSelect items={items} onSelect={onSelectStub} />);

        let select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Select');

        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));

        let options = getByRole('listbox', { hidden: true });

        // Click the third option
        fireEvent.click(options.children[2]);
        await waitFor(() => getByRole('combobox', { hidden: true }));

        // Third option should be selected
        select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Label 3');

        // onSelect function should be called with the third item
        expect(onSelectStub).toHaveBeenCalledTimes(1);
        expect(onSelectStub.mock.results[0].value).toEqual({ label: 'Label 3', value: 'Value 3' });

        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));
        options = getByRole('listbox', { hidden: true });

        // Click the first option
        fireEvent.click(options.children[0]);
        await waitFor(() => getByRole('combobox', { hidden: true }));

        // First option should be selected
        select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Label 1');

        // onSelect function should be called with the first item
        expect(onSelectStub).toHaveBeenCalledTimes(2);
        expect(onSelectStub.mock.results[1].value).toEqual({ label: 'Label 1', value: 'Value 1' });
    });

    it('should respect initialValue and be in controlled mode', async () => {
        const onSelectStub = jest.fn((value) => value);
        const { getByRole, rerender } = render(
            <RenderSelect items={items} onSelect={onSelectStub} selectedItem={items[3]} />
        );

        let select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Label 4');

        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));

        const options = getByRole('listbox', { hidden: true });

        // Click the second option
        fireEvent.click(options.children[1]);
        await waitFor(() => getByRole('combobox', { hidden: true }));

        // onSelect function should be called with the second item
        expect(onSelectStub).toHaveBeenCalledTimes(1);
        expect(onSelectStub.mock.results[0].value).toEqual({ label: 'Label 2', value: 'Value 2' });

        // Selected item should not change in controlled mode
        select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Label 4');

        // Only changing the selectedItem through props changes the selected item
        rerender(<RenderSelect items={items} onSelect={onSelectStub} selectedItem={items[1]} />);
        select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Label 2');
    });

    it('should support the disabled prop', async () => {
        const onSelectStub = jest.fn();
        const { getByRole, rerender } = render(<RenderSelect disabled items={items} onSelect={onSelectStub} />);
        let select = getByRole('combobox', { hidden: true });
        expect(select).toHaveAttribute('disabled');
        expect(select).toHaveStyle(`background-color: ${theme.colors.grey1}`);
        expect(select).toHaveStyle(`color: ${theme.colors.grey2}`);

        // Check that the select button is not clickable
        fireEvent.click(select);
        await waitFor(() => getByRole('combobox', { hidden: true }));

        const options = getByRole('listbox', { hidden: true });

        // Options should not become visible
        expect(options).toHaveStyle('display: none');

        // Re-render the select component to check that the select button is still disabled
        rerender(<RenderSelect disabled items={items} onSelect={onSelectStub} />);

        select = getByRole('combobox', { hidden: true });
        expect(select).toHaveAttribute('disabled');
        expect(select).toHaveStyle(`background-color: ${theme.colors.grey1}`);
        expect(select).toHaveStyle(`color: ${theme.colors.grey2}`);
    });

    it('should work with placeholder', async () => {
        const onSelectStub = jest.fn((value) => value);
        const { getByRole } = render(
            <RenderSelect items={items} onSelect={onSelectStub} placeholder="Test Placeholder" />
        );

        // Check that placeholder is shown correctly
        let select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Test Placeholder');

        // Check that selecting values works correctly
        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));

        const options = getByRole('listbox', { hidden: true });

        // Click the third option
        fireEvent.click(options.children[2]);
        await waitFor(() => getByRole('combobox', { hidden: true }));

        // Third option should be selected
        select = getByRole('combobox', { hidden: true });
        expect(select).toHaveTextContent('Label 3');

        // onSelect function should be called with the third item
        expect(onSelectStub).toHaveBeenCalledTimes(1);
        expect(onSelectStub.mock.results[0].value).toEqual({ label: 'Label 3', value: 'Value 3' });
    });

    it('should respect errorMsg and show it as tooltip', async () => {
        const { getByRole, getByText } = render(<RenderSelect errorMsg="Test Error" items={items} />);

        const select = getByRole('combobox', { hidden: true });

        // Check that select has an error boundary
        expect(select.parentElement).toHaveStyle(`border: 1px solid ${theme.colors.error}`);

        // Check that the tooltip is displayed and the errorMsg is correct
        userEvent.hover(getByRole('combobox', { hidden: true }));
        await waitFor(() => getByText('Test Error'));

        expect(getByText('Test Error')).toBeInTheDocument();
    });
});
