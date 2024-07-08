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
import { format } from 'date-fns';

import { ThemeProvider, theme } from '@darajs/styled-components';

import DatePicker, { DatePickerProps } from './datepicker';

function RenderDatePicker(props: DatePickerProps = { shouldCloseOnSelect: true }): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <DatePicker {...props} />
        </ThemeProvider>
    );
}

describe('DatePicker', () => {
    it('should display correctly initially', async () => {
        const { container } = render(RenderDatePicker());

        // Wrapper should be displayed
        await waitFor(() => {
            const datepickerWrapper = container.querySelector('.react-datepicker-wrapper');
            expect(datepickerWrapper).toBeDefined();
        });
    });

    it('should show initial value on the input', async () => {
        const currentDate = new Date();
        const { container } = render(RenderDatePicker({ initialValue: currentDate, shouldCloseOnSelect: true }));

        await waitFor(() => {
            const input = container.querySelector('input');

            expect(input).toBeInTheDocument();
            expect(input).toHaveValue(format(currentDate, 'dd/MM/uuuu'));
        });
    });

    it('should format initial value on the input', async () => {
        const currentDate = new Date();
        const { container } = render(
            RenderDatePicker({ dateFormat: 'MM/dd/uuuu', initialValue: currentDate, shouldCloseOnSelect: true })
        );

        await waitFor(() => {
            const input = container.querySelector('input');

            expect(input).toBeInTheDocument();
            expect(input).toHaveValue(format(currentDate, 'MM/dd/uuuu'));
        });
    });

    it('should show time input when showTimeInput is true', async () => {
        const { container } = render(RenderDatePicker({ shouldCloseOnSelect: true, showTimeInput: true }));

        await waitFor(() => {
            const input = container.querySelector("input[type='time']");

            expect(input).toBeInTheDocument();
            expect(input).toHaveValue('00:00');
        });
    });

    it('should show initial time when showTimeInput is true', async () => {
        const currentDate = new Date();
        const { container } = render(
            RenderDatePicker({ initialValue: currentDate, shouldCloseOnSelect: true, showTimeInput: true })
        );

        await waitFor(() => {
            const input = container.querySelector("input[type='time']");

            const hours = String(currentDate.getHours());
            const minutes = String(currentDate.getMinutes());
            const formattedHours = hours.length > 1 ? hours : `0${hours}`;
            const formattedMinutes = minutes.length > 1 ? minutes : `0${minutes}`;

            expect(input).toBeInTheDocument();
            expect(input).toHaveValue(`${formattedHours}:${formattedMinutes}`);
        });
    });

    it('should show initial inputs on date range when selectsRange is true', async () => {
        const currentDate = new Date();
        const { container } = render(
            RenderDatePicker({
                initialValue: [currentDate, currentDate],
                selectsRange: true,
                shouldCloseOnSelect: true,
            })
        );

        await waitFor(() => {
            const inputs = container.querySelectorAll('input');

            const startInput = inputs[0];
            expect(startInput).toBeInTheDocument();
            const endInput = inputs[1];
            expect(endInput).toBeInTheDocument();

            const formattedDate = format(currentDate, 'dd/MM/uuuu');
            expect(startInput).toHaveValue(`${formattedDate}`);
            expect(endInput).toHaveValue(`${formattedDate}`);
        });
    });

    it('should call onChange if in controlled mode', async () => {
        const onChange = jest.fn();
        const currentDate = new Date();
        const { container } = render(RenderDatePicker({ onChange, shouldCloseOnSelect: true, value: currentDate }));

        await waitFor(() => {
            const input = container.querySelector('input');

            expect(input).toBeInTheDocument();

            input?.focus();
            input?.blur();

            expect(onChange).toHaveBeenCalledWith(currentDate);
        });
    });
});
