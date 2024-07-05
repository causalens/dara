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
import { Meta } from '@storybook/react';
import { useState } from 'react';

import { BaseSliderProps, Slider as SliderComponent } from './slider';

export default {
    component: SliderComponent,
    title: 'UI Components/Slider',
} as Meta;

export const Slider = (args: BaseSliderProps<number>): JSX.Element => (
    <div style={{ alignItems: 'center', display: 'flex', height: '100%' }}>
        <SliderComponent {...args} />
    </div>
);

Slider.args = {
    domain: [0, 2],

    // domain: [1, 1.001],
    initialValue: [1.0],

    step: 0.2,

    ticks: [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0],
};

export const ControlledSlider = (args: BaseSliderProps<number>): JSX.Element => {
    const { ...argsWithoutValue } = args;

    const [value, setValue] = useState([1.0]);

    function onChange(vals): void {
        setValue(vals);
        args.onChange?.(vals);
    }

    return (
        <div>
            <button onClick={() => setValue([2.0])} type="button">
                Set value to 2
            </button>
            <SliderComponent {...argsWithoutValue} onChange={onChange} values={value} />
        </div>
    );
};
ControlledSlider.args = {
    domain: [0, 2],
    step: 0.2,
    ticks: [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0],
};
