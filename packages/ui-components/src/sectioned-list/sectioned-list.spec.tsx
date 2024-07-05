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

import SectionedList, { ListItem, SectionedListProps } from './sectioned-list';

const sampleListItems = (header: string): Array<ListItem> => [
    {
        heading: false,
        label: `${header} item 1`,
        value: `${header} value 1`,
    },
    {
        heading: false,
        label: `${header} item 2`,
        value: `${header} value 2`,
    },
    {
        heading: false,
        label: `${header} item 3`,
        value: `${header} value 3`,
    },
];

const sampleListSections = [
    { items: sampleListItems('1'), label: 'Section 1' },
    { items: sampleListItems('2'), label: 'Section 2' },
    { items: sampleListItems('3'), label: 'Section 3' },
];

function RenderSectionedList(props: SectionedListProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <SectionedList {...props} />
        </ThemeProvider>
    );
}

describe('Sectioned List', () => {
    it('should display correctly', () => {
        const { getByRole } = render(<RenderSectionedList items={sampleListSections} />);
        const options = getByRole('listbox', { hidden: true });

        // All the options are in the document on render
        expect(options).toBeInTheDocument();

        // The options are currently not displayed
        expect(options).toHaveStyle('display: none');

        expect(options.childElementCount).toBe(
            sampleListSections.length + sampleListSections.length * sampleListItems('').length
        );
    });

    it('should support unsectioned list items', () => {
        const sampleItems = sampleListItems('');
        const { getByRole } = render(<RenderSectionedList items={sampleItems} />);
        const options = getByRole('listbox', { hidden: true });
        expect(options.childElementCount).toBe(sampleItems.length);
    });

    it('should listen to changes to selected items', async () => {
        const onSelectStub = jest.fn((value) => value);
        const sampleItems = sampleListItems('');
        const { getByRole } = render(<RenderSectionedList items={sampleItems} onSelect={onSelectStub} />);
        const select = getByRole('combobox', { hidden: true });
        let options = getByRole('listbox', { hidden: true });

        // Click the select button
        fireEvent.click(select);
        await waitFor(() => getByRole('listbox', { hidden: true }));

        options = getByRole('listbox', { hidden: true });

        // Click the first option
        fireEvent.click(options.children[0]);

        expect(onSelectStub).toHaveBeenCalledTimes(1);
        expect(onSelectStub.mock.results[0].value).toEqual(sampleItems[0]);
    });

    it('should filter list by input', async () => {
        const sampleItems = sampleListItems('');
        const { container, getByRole } = render(<RenderSectionedList items={sampleItems} />);
        const options = getByRole('listbox', { hidden: true });
        const input = container.querySelector('[id$=-input]');

        // Wait for SectionedList to be responsive
        userEvent.type(input, '3', { delay: 5 });
        await new Promise<void>((r) => setTimeout(() => r(), 100));

        for (let idx = 0; idx < options.childElementCount; idx++) {
            // expect options to include only items with '3' in the label
            expect(options.children[idx].textContent.includes('3')).toBeTruthy();
        }
    });
});
