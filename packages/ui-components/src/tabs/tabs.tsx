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
import isEqual from 'lodash/isEqual';

import styled from '@darajs/styled-components';

const TabWrapper = styled.div`
    overflow: hidden;
    display: flex;

    /* This is needed as the content of a TabbedCard overflows for the wrapper to not shrink */
    flex-shrink: 0;

    width: 100%;

    border-radius: 1rem 1rem 0 0;
`;

interface TabProps {
    selected: boolean;
}

const TabComponent = styled.span<TabProps>`
    cursor: pointer;
    user-select: none;

    overflow: hidden;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;

    box-sizing: border-box;
    height: 2.5rem;

    color: ${(props) => (props.selected ? props.theme.colors.primary : props.theme.colors.grey3)};

    background-color: ${(props) => props.theme.colors.blue1};
    border-bottom: ${(props) =>
        props.selected ? `2px solid ${props.theme.colors.primary}` : `1px solid ${props.theme.colors.grey3}`};

    :hover {
        color: ${(props) => (props.selected ? props.theme.colors.primary : props.theme.colors.text)};
        background-color: ${(props) => (props.selected ? props.theme.colors.blue1 : props.theme.colors.grey1)};
    }

    h2 {
        font-weight: ${(props) => (props.selected ? '700' : '400')};
    }
`;

const Title = styled.h2`
    overflow: hidden;

    width: 100%;
    margin: 0;
    padding: 0 1rem;

    font-size: 1rem;
    font-weight: 300;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

export interface TabInterface {
    title: any;
}

function instanceOfTab(tab: any): tab is TabInterface {
    return typeof tab === 'string' ? false : 'title' in tab;
}

export interface TabsProps<T> {
    /** Standard react className property */
    className?: string;
    /** An optional handler to notify the parent when the selected tab changes */
    onSelectTab?: (tab: T | TabInterface | string) => void | Promise<void>;
    /** The selected tab, defaults to the first one */
    selectedTab?: T;
    /** A list of tab strings to display */
    tabs: Array<T>;
}

/**
 * A simple Tabs component that renders a set of tabs and manages which one is currently selected. Accepts an
 * onSelectTab handler to notify the parent component when the selected tab changes
 *
 * @param {TabsProps} props - the component props
 */
function Tabs<T>({ className, onSelectTab, selectedTab, tabs }: TabsProps<T>): JSX.Element {
    const objectTabs = tabs.map((tab) => (instanceOfTab(tab) ? tab : { title: tab }));
    const tabSelected = instanceOfTab(selectedTab) ? selectedTab : { title: selectedTab };
    const onClick = (tab: T | TabInterface | string) => () => {
        if (onSelectTab) {
            onSelectTab(tab);
        }
    };
    return (
        <TabWrapper className={className}>
            {objectTabs.map((tab, idx) => (
                <TabComponent
                    key={`tab-${objectTabs[idx].title as string}`}
                    onClick={onClick(instanceOfTab(selectedTab) ? tab : tab.title)}
                    selected={isEqual(tab, tabSelected || objectTabs[0])}
                >
                    <Title>{tab.title}</Title>
                </TabComponent>
            ))}
        </TabWrapper>
    );
}

export default Tabs;
