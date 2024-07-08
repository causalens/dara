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
import { fireEvent, render } from '@testing-library/react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import Carousel, { CarouselProps } from './carousel';

function RenderCarousel(props: CarouselProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Carousel {...props} />
        </ThemeProvider>
    );
}

const mockPanels = [{ title: 'value0' }, { title: 'value1' }, { title: 'value2' }];

describe('Carousel', () => {
    it('should display correctly when loaded', () => {
        const { getByText } = render(<RenderCarousel items={mockPanels} />);

        for (let i = 0; i < 3; i++) {
            const valueName = `value${i}`;

            // The element is always in the DOM
            const valueElement = getByText(valueName);
            expect(valueElement).toBeInTheDocument();
        }
    });

    it('onChange should be called when clicking buttons in controlled mode', () => {
        const onChange = jest.fn();
        const { getByTestId } = render(<RenderCarousel items={mockPanels} onChange={onChange} value={1} />);

        const leftArrow = getByTestId('carousel-left-button');
        const rightArrow = getByTestId('carousel-right-button');

        fireEvent.click(leftArrow);
        expect(onChange).toHaveBeenCalledWith(0);

        fireEvent.click(rightArrow);
        expect(onChange).toHaveBeenCalledWith(2);
    });

    it('Check that carousel loops at both ends', () => {
        const onChange = jest.fn();
        const { getByTestId, rerender } = render(<RenderCarousel items={mockPanels} onChange={onChange} value={2} />);

        expect(onChange).toHaveBeenCalledTimes(0);

        const leftArrow = getByTestId('carousel-left-button');
        const rightArrow = getByTestId('carousel-right-button');

        fireEvent.click(rightArrow);
        expect(onChange).toHaveBeenCalledWith(0);

        // set component value to 0
        rerender(<RenderCarousel items={mockPanels} onChange={onChange} value={0} />);

        fireEvent.click(leftArrow);
        expect(onChange).toHaveBeenCalledWith(2);
    });
});
