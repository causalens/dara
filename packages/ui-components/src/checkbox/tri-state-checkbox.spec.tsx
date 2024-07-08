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

import TriStateCheckbox, { CheckboxProps, CheckboxState } from './tri-state-checkbox';

function RenderTriStateCheckbox(props: CheckboxProps = {}): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <TriStateCheckbox {...props} />
        </ThemeProvider>
    );
}

describe('TriStateCheckbox', () => {
    it('should display correctly', () => {
        const { getByRole } = render(<RenderTriStateCheckbox />);

        const checkbox = getByRole('checkbox', { hidden: true });
        expect(checkbox.tagName).toEqual('INPUT');
    });

    it('should call the onChange stub correctly when clicked and should only update when new props are passed', async () => {
        const onClickStub = jest.fn();
        const { getByRole, rerender } = render(<RenderTriStateCheckbox onChange={onClickStub} />);

        // Click - check onClick is called with UNCHECKED
        fireEvent.click(getByRole('checkbox', { hidden: true }));
        await waitFor(() => getByRole('checkbox', { hidden: true }));
        expect(onClickStub).toHaveBeenCalledTimes(1);
        expect(onClickStub).toHaveBeenCalledWith(CheckboxState.UNCHECKED, expect.any(Object));

        // Set the checkbox to be unchecked
        rerender(<RenderTriStateCheckbox noneSelected onChange={onClickStub} />);

        // Click again and check that the new state is CHECKED
        onClickStub.mockClear();
        fireEvent.click(getByRole('checkbox', { hidden: true }));
        await waitFor(() => getByRole('checkbox', { hidden: true }));
        expect(onClickStub).toHaveBeenCalledTimes(1);
        expect(onClickStub).toHaveBeenCalledWith(CheckboxState.CHECKED, expect.any(Object));

        // Set the checkbox to be checked
        rerender(<RenderTriStateCheckbox allSelected onChange={onClickStub} />);

        // Click again and check that the new state is UNCHECKED
        onClickStub.mockClear();
        fireEvent.click(getByRole('checkbox', { hidden: true }));
        await waitFor(() => getByRole('checkbox', { hidden: true }));
        expect(onClickStub).toHaveBeenCalledTimes(1);
        expect(onClickStub).toHaveBeenCalledWith(CheckboxState.UNCHECKED, expect.any(Object));
    });
});
