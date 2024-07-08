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
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider, theme } from '@darajs/styled-components';

import MultiSelect, { MultiSelectProps } from './multiselect';

const sampleItems = [
    {
        label: 'label 1',
        value: 'value 1',
    },
    {
        label: 'label 2',
        value: 'value 2',
    },
    {
        label: 'label 3',
        value: 'value 3',
    },
    {
        label: 'label 4',
        value: 'value 4',
    },
    {
        label: 'label 5',
        value: 'value 5',
    },
    {
        label: 'label 6',
        value: 'value 6',
    },
    {
        label: 'label 7',
        value: 'value 7',
    },
    {
        label: 'label 8',
        value: 'value 8',
    },
    {
        label: 'label 9',
        value: 'value 9',
    },
    {
        label: 'label 10',
        value: 'value 10',
    },
];

function RenderMultiSelect(props: MultiSelectProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <MultiSelect {...props} />
        </ThemeProvider>
    );
}

describe('MultiSelect', () => {
    it('should display correctly', () => {
        const { getByRole } = render(<RenderMultiSelect items={sampleItems} />);
        const multiselect = getByRole('combobox');
        const options = getByRole('listbox', { hidden: true });
        const chevron = getByRole('img', { hidden: true });

        expect(multiselect).toBeInTheDocument();

        expect(chevron.classList).toContain('fa-chevron-down');

        expect(options.childElementCount).toBe(sampleItems.length);
        for (let idx = 0; idx < sampleItems.length; idx++) {
            expect(options.children[idx].textContent).toBe(sampleItems[idx].label);
        }
    });

    it('should call onTermChange corrrectly', async () => {
        const onTermChangeStub = jest.fn((value) => value);
        const { getByRole, container } = render(
            <RenderMultiSelect items={sampleItems} onTermChange={onTermChangeStub} />
        );
        const options = getByRole('listbox', { hidden: true });
        const input = container.querySelector('[id$=-input]');

        // Wait for multiselect to be responsive
        await new Promise((r) => setTimeout(() => r(), 100));

        userEvent.type(input, 'value 1', { delay: 5 });

        await waitFor(() => {
            expect(onTermChangeStub).toHaveBeenCalledTimes(7);
        });
        expect(onTermChangeStub.mock.results[6].value).toEqual('value 1');

        // Expect that the options list is not filtered at this point.
        expect(options.childElementCount).toBe(sampleItems.length);
        for (let idx = 0; idx < sampleItems.length; idx++) {
            expect(options.children[idx].textContent).toBe(sampleItems[idx].label);
        }
    });

    it('should listen to changes to all multiselected items', async () => {
        const onSelectStub = jest.fn((value) => value);

        const { getByRole, container } = render(<RenderMultiSelect items={sampleItems} onSelect={onSelectStub} />);
        const multiselect = getByRole('combobox') as HTMLInputElement;

        const options = getByRole('listbox', { hidden: true });

        await new Promise<void>((r) => setTimeout(() => r(), 100));
        userEvent.click(options.children[0]);

        await waitFor(() => {
            expect(multiselect.parentElement).toHaveTextContent(sampleItems[0].label);
        });
        expect(onSelectStub).toHaveBeenCalledTimes(1);
        expect(onSelectStub.mock.results[0].value).toEqual([sampleItems[0]]);

        await new Promise<void>((r) => setTimeout(() => r(), 100));
        userEvent.click(options.children[0]);

        await waitFor(() => {
            expect(multiselect.parentElement).toHaveTextContent(`${sampleItems[0].label}${sampleItems[1].label}`);
        });

        expect(onSelectStub).toHaveBeenCalledTimes(2);
        expect(onSelectStub.mock.results[1].value).toEqual([sampleItems[0], sampleItems[1]]);

        const removeTagButton = container.querySelector('[data-icon="xmark"');
        userEvent.click(removeTagButton);
        expect(multiselect).not.toHaveTextContent(sampleItems[0].label);
    });

    it('should respect initialIsOpen and open dropdown on initial render', async () => {
        const { getByRole } = render(<RenderMultiSelect initialIsOpen items={sampleItems} />);

        await waitFor(() => {
            const options = getByRole('listbox', { hidden: true });
            expect(options).toHaveStyle('display: flex');
        });
    });

    it('should work with placeholder', async () => {
        const { container, getByRole } = render(<RenderMultiSelect items={sampleItems} placeholder="test" />);

        const multiselect = getByRole('combobox');
        const options = getByRole('listbox', { hidden: true });
        const input = container.querySelector('[id$=-input]');

        expect(input).toHaveAttribute('placeholder', 'test');
        expect(input).toHaveAttribute('value', '');

        await new Promise((r) => setTimeout(() => r(), 100));

        userEvent.type(input, 'new input', { delay: 5 });

        await waitFor(() => {
            expect(input).toHaveAttribute('value', 'new input');
        });

        userEvent.clear(input);

        userEvent.selectOptions(options, sampleItems[0].label);
        expect(multiselect.parentElement).toHaveTextContent(sampleItems[0].label);
    });

    it('should respect errorMsg and show it as tooltip', async () => {
        const { getByRole, getByText } = render(<RenderMultiSelect errorMsg="Test Error" items={sampleItems} />);

        // TODO: update this test based on whether to keep error message or not
        // const multiselect = getByRole('combobox', { hidden: true });

        // expect(multiselect.parentElement).toHaveStyle(`border: 1px solid ${theme.colors.error}`);

        userEvent.hover(getByRole('combobox', { hidden: true }));
        await waitFor(() => expect(getByText('Test Error')).toBeInTheDocument());
    });

    it('should respect the maxWidth and maxRows', async () => {
        const { getByRole } = render(<RenderMultiSelect items={sampleItems} maxRows={5} maxWidth="200px" />);

        const multiselect = getByRole('combobox', { hidden: true });

        await waitFor(() => {
            expect(multiselect.parentElement?.parentElement?.parentElement).toHaveStyle('max-width: 200px');
            expect(multiselect.parentElement?.parentElement?.parentElement).toHaveStyle('max-height: 12.5rem');
        });
    });
});
