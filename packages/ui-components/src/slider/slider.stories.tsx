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
import * as React from 'react';
import { useState } from 'react';

import { BaseSliderProps, Slider as SliderComponent, CategoricalSlider as CategoricalSliderComponent } from './slider';

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

    trackToStart: false,
    trackToEnd: false,
};

export const SliderTicksNumber = Slider.bind({});
SliderTicksNumber.args = {
    domain: [0, 2],

    // domain: [1, 1.001],
    initialValue: [1.0],

    step: 0.2,

    ticks: 5,
};

export const SliderMultiThumb = Slider.bind({});
SliderMultiThumb.args = {
    domain: [0, 2],

    initialValue: [1.0, 1.4],

    step: 0.2,
    trackToStart: false,
    trackToEnd: false,

    thumbLabels: ['min', 'max']
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

export const ControlledSliderIncompatible = (args: BaseSliderProps<number>): JSX.Element => {
    const [domain, setDomain] = useState([1, 151]);
    const [step, setStep] = useState(1);
    const [value, setValue] = useState([102]);

    function onChange(vals): void {
        setValue(vals);
        args.onChange?.(vals);
    }

    function changeDomain(): void {
        setDomain([17, 197]);
        setStep(9);
    }

    function resetDomain(): void {
        setDomain([1, 151]);
        setStep(1);
    }

    return (
        <div>
            <button onClick={() => changeDomain()} type="button">
            Change Domain to 197
            </button>
            <button onClick={() => resetDomain()} type="button">
                Reset Domain to 1,151
            </button>
            <SliderComponent {...args} onChange={onChange} values={value} domain={domain} step={step} />
        </div>
    );
};

export const CategoricalSlider = (args: BaseSliderProps<string>): JSX.Element => {

    return (
        <div style={{ alignItems: 'center', display: 'flex', height: '100%' }}>
            <CategoricalSliderComponent {...args} />
        </div>
    );
};

CategoricalSlider.args = {
    domain: ['low', 'med', 'high'],
    initialValue: ['med'],
};

export const MultipleThumbs = Slider.bind({});
MultipleThumbs.args = {
    domain: [0, 10],

    initialValue: [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0],

    step: 0.1,

};

export const TrackLabels = Slider.bind({});
TrackLabels.args = {
    domain: [1, 16],

    initialValue: [1, 6, 8],
    step: 1,

    trackLabels: ['first range', 'second range'],
    trackToStart: false,
};

export const SmallDecimals = Slider.bind({});
SmallDecimals.args = {
    domain: [0, 1],

    initialValue: [0.004],
    step: 0.002,
};
