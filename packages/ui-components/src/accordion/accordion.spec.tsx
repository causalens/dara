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

import Badge from '../badge/badge';
import { AccordionItemType } from '../types';
import Accordion, { AccordionProps } from './accordion';

function RenderAccordion(props: AccordionProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Accordion {...props} />
        </ThemeProvider>
    );
}

const mockItems: Array<AccordionItemType> = [
    { badge: { color: 'red', label: 'Badge1' }, content: 'value0', label: 'Header0' },
    { content: 'value1', label: 'Header1' },
    { content: 'value2', label: 'Header2' },
    { badge: { color: 'green', label: 'Badge2' }, content: 'value3', label: 'Header3' },
    { content: 'value4', label: 'Header4' },
];

const COLLAPSE_CLASS = '.ReactCollapse--collapse';

describe('Accordion Component', () => {
    it('should display correctly when loaded', () => {
        const { getByText } = render(<RenderAccordion items={mockItems} />);

        for (let i = 0; i < 5; i++) {
            const headerName = `Header${i}`;
            const valueName = `value${i}`;

            // Header is always in the DOM
            expect(getByText(headerName)).toBeInTheDocument();

            // The element is always in the DOM
            const valueElement = getByText(valueName);
            expect(valueElement).toBeInTheDocument();

            // all elements are hidden
            const collapseElement = valueElement.closest(COLLAPSE_CLASS);
            expect(collapseElement).toHaveAttribute('aria-hidden', 'true');
        }
    });

    it('should respect initialOpenItem', () => {
        const { getByText } = render(<RenderAccordion initialOpenItems={[2]} items={mockItems} />);

        for (let i = 0; i < 5; i++) {
            const valueName = `value${i}`;

            // The element is always in the DOM
            const valueElement = getByText(valueName);
            expect(valueElement).toBeInTheDocument();

            // Third element is not hidden
            const collapseElement = valueElement.closest(COLLAPSE_CLASS);
            expect(collapseElement).toHaveAttribute('aria-hidden', i === 2 ? 'false' : 'true');
        }
    });

    it('should use header render correctly', () => {
        const headerRenderer = (item: AccordionItemType): JSX.Element => {
            return (
                <div>
                    <span>{item.label}</span>
                    {item.badge && <Badge color={item.badge.color}>{item.badge.label}</Badge>}
                </div>
            );
        };
        const { getByText } = render(<RenderAccordion headerRenderer={headerRenderer} items={mockItems} />);
        expect(getByText('Badge1')).toHaveStyle('background-color: red');
        expect(getByText('Badge2')).toHaveStyle('background-color: green');
    });

    it('should use inner render correctly', () => {
        const innerRenderer = (item: AccordionItemType): JSX.Element => {
            if (item.content !== 'value4') {
                return <span style={{ backgroundColor: 'red' }}>{item.content}</span>;
            }
            return <span style={{ color: 'blue', fontSize: '2rem' }}>{item.content}</span>;
        };
        const { getByText } = render(<RenderAccordion innerRenderer={innerRenderer} items={mockItems} />);
        expect(getByText('value0')).toHaveStyle('background-color: red');
        expect(getByText('value4')).toHaveStyle('color: blue');
        expect(getByText('value4')).toHaveStyle('font-size: 2rem');
    });

    it('should close currently open item on click', async () => {
        const { getByText } = render(<RenderAccordion initialOpenItems={0} items={mockItems} />);

        const newHeader = getByText('Header0');
        fireEvent.click(newHeader);

        await waitFor(() => {
            for (let i = 0; i < 5; i++) {
                const hiddenValueElement = getByText(`value${i}`).closest(COLLAPSE_CLASS);
                expect(hiddenValueElement).toHaveAttribute('aria-hidden', 'true');
            }
        });
    });

    it('should open a new item and close the previous one on click', async () => {
        const { getByText } = render(<RenderAccordion items={mockItems} />);

        const newHeader = getByText('Header4');
        fireEvent.click(newHeader);

        await waitFor(() => {
            // Clicked element is now visible
            const newValueElement = getByText('value4').closest(COLLAPSE_CLASS);
            expect(newValueElement).toHaveAttribute('aria-hidden', 'false');

            // All other elements are hidden
            for (let i = 0; i < 4; i++) {
                const hiddenValueElement = getByText(`value${i}`).closest(COLLAPSE_CLASS);
                expect(hiddenValueElement).toHaveAttribute('aria-hidden', 'true');
            }
        });
    });

    it('should test controlled state', async () => {
        const onChange = jest.fn();
        const { getByText } = render(<RenderAccordion items={mockItems} onChange={onChange} value={1} />);

        // checkes initial value is open
        for (let i = 0; i < 5; i++) {
            const valueName = `value${i}`;

            // The element is always in the DOM
            const valueElement = getByText(valueName);
            expect(valueElement).toBeInTheDocument();

            // Second element is not hidden
            const collapseElement = valueElement.closest(COLLAPSE_CLASS);
            expect(collapseElement).toHaveAttribute('aria-hidden', i === 1 ? 'false' : 'true');
        }

        const newHeader = getByText('Header4');
        fireEvent.click(newHeader);

        await waitFor(() => {
            // onChange is called with the new value
            expect(onChange).toHaveBeenCalledWith([1, 4]);

            // As it is controlled the visible element is still the same
            for (let i = 0; i < 5; i++) {
                const hiddenValueElement = getByText(`value${i}`).closest(COLLAPSE_CLASS);
                expect(hiddenValueElement).toHaveAttribute('aria-hidden', i === 1 ? 'false' : 'true');
            }
        });
    });
});
