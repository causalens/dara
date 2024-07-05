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
import { fireEvent, render } from '@testing-library/react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import { BaseSliderProps, Slider, computeStep } from './slider';

const domain: [number, number] = [0, 100];
const initialValue = [20, 60];

function RenderNumericSlider(props: BaseSliderProps<number>): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Slider {...props} />
        </ThemeProvider>
    );
}

describe('Numeric Slider Test', () => {
    beforeEach(() => {
        // IntersectionObserver isn't available in test environment
        const mockIntersectionObserver = jest.fn();
        mockIntersectionObserver.mockReturnValue({
            disconnect: () => null,
            observe: () => null,
            unobserve: () => null,
        });
        window.IntersectionObserver = mockIntersectionObserver;
    });

    it('should display correctly', () => {
        const { getByRole, getByTestId, getAllByTestId } = render(
            <RenderNumericSlider domain={domain} initialValue={initialValue} />
        );

        const rail = getByTestId('rail');
        const handles = getAllByTestId('handle-', { exact: false });
        const tracks = getAllByTestId('track-', { exact: false });
        const ticks = getAllByTestId('tick-', { exact: false });

        // All the slider elements should display correctly
        expect(rail).toHaveStyle('width: 100%');
        expect(handles.length).toEqual(2);
        expect(handles[0]).toHaveStyle(`left: ${initialValue[0]}%`);
        expect(handles[1]).toHaveStyle(`left: ${initialValue[1]}%`);
        expect(tracks.length).toEqual(2);
        expect(tracks[0]).toHaveStyle(`left: 0%; width: ${initialValue[0]}%`);
        expect(tracks[1]).toHaveStyle(`left: ${initialValue[0]}%; width: ${initialValue[1] - initialValue[0]}%`);
        expect(ticks.length).toEqual(6);
        expect(ticks[0].textContent).toEqual('0');
        expect(ticks[1].textContent).toEqual('20');
        expect(ticks[2].textContent).toEqual('40');
        expect(ticks[3].textContent).toEqual('60');
        expect(ticks[4].textContent).toEqual('80');
        expect(ticks[5].textContent).toEqual('100');

        // The alternative input switch should display correctly
        const switchButton = getByRole('presentation', { hidden: true });
        expect(switchButton.tagName).toEqual('svg');
    });

    it('should respect initialValue', () => {
        const { getAllByTestId } = render(<RenderNumericSlider domain={domain} initialValue={initialValue} />);

        const handles = getAllByTestId('handle-', { exact: false });

        // Initial Values to check by checking the handle positions
        expect(handles[0]).toHaveStyle(`left: 20%`);
        expect(handles[1]).toHaveStyle(`left: 60%`);
    });

    it('should switch to inputs when clicking use input alternative', () => {
        const { getByRole, getAllByRole, getByTestId, getAllByTestId } = render(
            <RenderNumericSlider domain={domain} initialValue={initialValue} />
        );

        const rail = getByTestId('rail');
        const handles = getAllByTestId('handle-', { exact: false });
        const tracks = getAllByTestId('track-', { exact: false });
        const ticks = getAllByTestId('tick-', { exact: false });

        expect(rail).toHaveStyle('width: 100%');
        expect(handles.length).toEqual(2);
        expect(tracks.length).toEqual(2);
        expect(ticks.length).toEqual(6);

        // Click on the alternative input button
        const switchButton = getByRole('presentation', { hidden: true });
        fireEvent.click(switchButton);

        const inputs = getAllByRole('textbox', { hidden: true });

        // Inputs with correct values should be displayed
        expect(inputs.length).toEqual(2);
        expect(inputs[0]).toHaveValue('20');
        expect(inputs[1]).toHaveValue('60');
    });

    it('should work with inputs normally', () => {
        const onChangeStub = jest.fn((value) => value);
        const { getByRole, getAllByRole } = render(
            <RenderNumericSlider domain={domain} onChange={onChangeStub} values={initialValue} />
        );
        const switchButton = getByRole('presentation', { hidden: true });
        fireEvent.click(switchButton);

        const inputs = getAllByRole('textbox', { hidden: true });

        expect(inputs.length).toEqual(2);
        expect(inputs[0]).toHaveValue('20');
        expect(inputs[1]).toHaveValue('60');

        // Initial call to onChangeStub on render
        expect(onChangeStub).toHaveBeenCalledTimes(0);

        // Firing a change event on first input calls the onChange function with the updated value
        fireEvent.change(inputs[0], { target: { value: 12 } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        expect(onChangeStub.mock.results[0].value).toEqual([12, 60]);

        // Firing a change event on second input calls the onChange function with the updated value
        fireEvent.change(inputs[1], { target: { value: 50 } });
        expect(onChangeStub).toHaveBeenCalledTimes(2);
        expect(onChangeStub.mock.results[1].value).toEqual([12, 50]);

        /**
         * Firing a change event on first input with a value more than second input should not
         * trigger onChange
         */
        fireEvent.change(inputs[0], { target: { value: 60 } });
        expect(onChangeStub).toHaveBeenCalledTimes(2);
    });

    it('should work with negative inputs', () => {
        const onChangeStub = jest.fn((value) => value);
        const { getByRole, getAllByRole } = render(
            <RenderNumericSlider domain={[-100, 100]} onChange={onChangeStub} values={initialValue} />
        );
        const switchButton = getByRole('presentation', { hidden: true });
        fireEvent.click(switchButton);

        const inputs = getAllByRole('textbox', { hidden: true });

        expect(inputs.length).toEqual(2);
        expect(inputs[0]).toHaveValue('20');
        expect(inputs[1]).toHaveValue('60');

        // Initial call to onChangeStub on render
        expect(onChangeStub).toHaveBeenCalledTimes(0);

        /**
         * Firing a change event with negative value on first input calls the onChange function with
         * the updated value
         */
        fireEvent.change(inputs[0], { target: { value: -12 } });
        expect(onChangeStub).toHaveBeenCalledTimes(1);
        expect(onChangeStub.mock.results[0].value).toEqual([-12, 60]);

        /**
         * Firing a change event with negative value on second input calls the onChange function with
         * the updated value
         */
        fireEvent.change(inputs[1], { target: { value: -5 } });
        expect(onChangeStub).toHaveBeenCalledTimes(2);
        expect(onChangeStub.mock.results[1].value).toEqual([-12, -5]);
    });
});

describe('Step computation', () => {
    const cases: Array<[number, number]> = [
        [1024, 100],
        [101, 10],
        [58, 1],
        [9, 0.1],
        [2, 0.1],
        [0.6, 0.01],
        [0.07, 0.001],
        [0.008, 0.0001],
    ];

    it.each(cases)('computes step correctly', (diff, expectedStep) => {
        expect(computeStep(diff)).toStrictEqual(expectedStep);
    });
});
