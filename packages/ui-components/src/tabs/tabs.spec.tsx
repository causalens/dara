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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider, theme } from '@darajs/styled-components';

import Tabs, { TabsProps } from './tabs';

function RenderTabs(props: TabsProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Tabs {...props} />
        </ThemeProvider>
    );
}

const sampleTabs = ['Tab 1', 'Tab 2', 'Tab 3'];

describe('Tabs', () => {
    it('should display correctly', () => {
        render(<RenderTabs selectedTab={sampleTabs[0]} tabs={sampleTabs} />);
        sampleTabs.forEach((tab) => expect(screen.getByText(tab)).toBeInTheDocument());
    });

    it('should listen to changes to selectedTab', () => {
        const onSelectTabStub = jest.fn((value) => value);
        render(<RenderTabs onSelectTab={onSelectTabStub} selectedTab={sampleTabs[0]} tabs={sampleTabs} />);

        const Tab2 = screen.getByText(sampleTabs[1]);
        userEvent.click(Tab2);
        expect(onSelectTabStub).toHaveBeenCalledTimes(1);
        expect(onSelectTabStub.mock.results[0].value).toEqual(sampleTabs[1]);
    });
});
