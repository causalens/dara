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
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider, theme } from '@darajs/styled-components';

import Switch, { SwitchProps } from './switch';

function RenderSwitch(props: SwitchProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Switch {...props} />
        </ThemeProvider>
    );
}

describe('Switch Test', () => {
    it('should display correctly', () => {
        const { getByTestId } = render(<RenderSwitch />);
        getByTestId('handle');
        expect(getByTestId('wrapper').textContent).toBe('OFF');
    });

    it('should respect initialValue', () => {
        const { getByTestId } = render(<RenderSwitch initialValue />);
        expect(getByTestId('wrapper').textContent).toBe('ON');
    });

    it('should call onChange in controlled mode', () => {
        const onChangeStub = jest.fn();
        const { getByTestId, rerender } = render(
            <RenderSwitch labels={{ off: 'disabled', on: 'enabled' }} onChange={onChangeStub} value />
        );

        const wrapper = getByTestId('wrapper');
        expect(wrapper.textContent).toBe('enabled');
        userEvent.click(wrapper);

        expect(onChangeStub).toHaveBeenCalledWith(false);
        expect(wrapper.textContent).toBe('enabled');

        // changing the value prop should update the switch state on rerender
        rerender(<RenderSwitch labels={{ off: 'disabled', on: 'enabled' }} onChange={onChangeStub} value={false} />);
        expect(wrapper.textContent).toBe('disabled');
    });
});
