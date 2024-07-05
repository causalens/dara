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

import ComponentSelectList, { ComponentSelectListProps } from './component-select-list';

// Disabling as it's just for tests
/* eslint-disable jsx-a11y/alt-text */
const items = [
    {
        component: <img src="https://test1.com" />,
        subtitle: 'Picture 1 subtitle',
        title: 'Picture 1',
    },
    {
        component: <img src="https://test2.com" />,
        subtitle: 'Picture 2 subtitle',
        title: 'Picture 2',
    },
    {
        component: <img src="https://test3.com" />,
        subtitle: 'Picture 3 subtitle',
        title: 'Picture 3',
    },
];
/* eslint-enable jsx-a11y/alt-text */

const singleInitialValue = ['Picture 2'];

const multiInitialValue = ['Picture 1', 'Picture 3'];

function RenderComponentSelectList(props: ComponentSelectListProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <ComponentSelectList {...props} />
        </ThemeProvider>
    );
}

const borderStyle = `border: 2px solid ${theme.colors.primary}`;

describe('ComponentSelectList', () => {
    it('should display correctly', () => {
        const { getByText, getAllByRole } = render(<RenderComponentSelectList items={items} />);

        // Check that the first picture's title and subtitle is rendered
        expect(getByText('Picture 1')).toBeInTheDocument();
        expect(getByText('Picture 1 subtitle')).toBeInTheDocument();

        // Check that the second picture's title and subtitle is rendered
        expect(getByText('Picture 2')).toBeInTheDocument();
        expect(getByText('Picture 2 subtitle')).toBeInTheDocument();

        // Check that the third picture's title and subtitle is rendered
        expect(getByText('Picture 3')).toBeInTheDocument();
        expect(getByText('Picture 3 subtitle')).toBeInTheDocument();

        // Check that the all three images with correct src are rendered
        const images = getAllByRole('img', { hidden: true });
        expect(images.length).toBe(3);
        expect(images[0].getAttribute('src')).toBe('https://test1.com');
        expect(images[1].getAttribute('src')).toBe('https://test2.com');
        expect(images[2].getAttribute('src')).toBe('https://test3.com');
    });

    it('should display the correct number of cards in a row', () => {
        const { container, rerender } = render(<RenderComponentSelectList items={items} />);

        // Check that 3 cards per row are rendered by default
        expect(container.children[0]).toHaveStyle('grid-template-columns: repeat(3,1fr)');

        // Re-render the component with 4 items per row
        rerender(<RenderComponentSelectList items={items} itemsPerRow={4} />);

        // Check that 4 cards per row are rendered for itemsPerRow=4
        expect(container.children[0]).toHaveStyle('grid-template-columns: repeat(4,1fr)');
    });

    it('should track value internally and respect initial value for single select mode', async () => {
        const onSelectStub = jest.fn((value) => value);
        const { getByText } = render(
            <RenderComponentSelectList items={items} onSelect={onSelectStub} selectedItems={singleInitialValue} />
        );

        // Check that the second card is selected
        expect(getByText('Picture 1').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).not.toHaveStyle(borderStyle);

        // Click the first card
        fireEvent.click(getByText('Picture 1'));
        await waitFor(() => getByText('Picture 1'));

        // Check that first card is selected
        expect(getByText('Picture 1').parentElement).toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).not.toHaveStyle(borderStyle);

        // Check that the onSelect function is called and first element is passed to it
        expect(onSelectStub).toHaveBeenCalledTimes(1);
        expect(onSelectStub.mock.results[0].value).toEqual(['Picture 1']);

        // Click the third card
        fireEvent.click(getByText('Picture 3'));
        await waitFor(() => getByText('Picture 3'));

        // Check that third card is selected
        expect(getByText('Picture 1').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).toHaveStyle(borderStyle);

        // Check that the onSelect function is called and third element is passed to it
        expect(onSelectStub).toHaveBeenCalledTimes(2);
        expect(onSelectStub.mock.results[1].value).toEqual(['Picture 3']);

        // Click the third card again
        fireEvent.click(getByText('Picture 3'));
        await waitFor(() => getByText('Picture 3'));

        // Check that no card is selected
        expect(getByText('Picture 1').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).not.toHaveStyle(borderStyle);

        // Check that the onSelect function is called and blank array is passed to it
        expect(onSelectStub).toHaveBeenCalledTimes(3);
        expect(onSelectStub.mock.results[2].value).toEqual([]);
    });

    it('should track value internally and respect initial value for multi select mode', async () => {
        const onSelectStub = jest.fn((value) => value);
        const { getByText } = render(
            <RenderComponentSelectList
                items={items}
                multiSelect
                onSelect={onSelectStub}
                selectedItems={multiInitialValue}
            />
        );

        // Check that the first and third cards are selected
        expect(getByText('Picture 1').parentElement).toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).toHaveStyle(borderStyle);

        // Click the first card
        fireEvent.click(getByText('Picture 1'));
        await waitFor(() => getByText('Picture 1'));

        // Check that only the third card is selected and first card get unselected
        expect(getByText('Picture 1').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).toHaveStyle(borderStyle);

        // Check that the onSelect function is called and third element is passed to it
        expect(onSelectStub).toHaveBeenCalledTimes(1);
        expect(onSelectStub.mock.results[0].value).toEqual(['Picture 3']);

        // Click the second card
        fireEvent.click(getByText('Picture 2'));
        await waitFor(() => getByText('Picture 2'));

        // Check that the second and third cards are selected
        expect(getByText('Picture 1').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).toHaveStyle(borderStyle);

        // Check that the onSelect function is called with second and third element getting passed to it
        expect(onSelectStub).toHaveBeenCalledTimes(2);
        expect(onSelectStub.mock.results[1].value).toEqual(['Picture 3', 'Picture 2']);

        // Click the second card
        fireEvent.click(getByText('Picture 2'));
        await waitFor(() => getByText('Picture 2'));

        // Check that only the third card is selected and second card get unselected
        expect(getByText('Picture 1').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).toHaveStyle(borderStyle);

        // Check that the onSelect function is called and third element is passed to it
        expect(onSelectStub).toHaveBeenCalledTimes(3);
        expect(onSelectStub.mock.results[2].value).toEqual(['Picture 3']);

        // Click the third card
        fireEvent.click(getByText('Picture 3'));
        await waitFor(() => getByText('Picture 3'));

        // Check that no card is selected
        expect(getByText('Picture 1').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 2').parentElement).not.toHaveStyle(borderStyle);
        expect(getByText('Picture 3').parentElement).not.toHaveStyle(borderStyle);

        // Check that the onSelect function is called and blank array is passed to it
        expect(onSelectStub).toHaveBeenCalledTimes(4);
        expect(onSelectStub.mock.results[3].value).toEqual([]);
    });
});
