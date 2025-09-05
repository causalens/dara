/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';

import {
    type ComponentInstance,
    DisplayCtx,
    DynamicComponent,
    type StyledComponentProps,
    type Variable,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';
import { Tabs } from '@darajs/ui-components';
import { useDeepCompare } from '@darajs/ui-utils';

import { CardDiv } from '../card/card';

const Card = styled.div`
    overflow: hidden;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.75rem;

    padding: 1.5rem;
`;

const TabbedCardWrapper = styled(CardDiv)`
    padding: 0;
`;

interface Tab {
    title: string;
}

interface TabProps extends ComponentInstance {
    props: {
        children: Array<ComponentInstance>;
        title: string;
    };
}

interface TabbedCardProps extends StyledComponentProps {
    /** Array of tab instances */
    children: Array<TabProps>;
    /** Optional chosen initial tab to render */
    initial_tab?: string;
    /** Optional selected tab mapped to a variable so that the selected tab can be easily accessed */
    selected_tab?: Variable<string>;
}

function mapTabProps({ props }: TabProps): Tab {
    return { title: props.title };
}

function findTabComponent(children: Array<TabProps>, selectedTab?: string): TabProps | undefined {
    return children.find(({ props: { title } }) => title === selectedTab);
}

function getTabHeader(children: Array<TabProps>, selectedTab?: string): Tab {
    const selected = findTabComponent(children, selectedTab);
    return selected ? mapTabProps(selected) : mapTabProps(children[0]!);
}

function getCardBody(children: Array<TabProps>, selectedTab: string): Array<ComponentInstance> {
    const selected = findTabComponent(children, selectedTab);
    return selected ? selected.props.children : children[0]!.props.children;
}

/**
 * A tabbed card component for displaying content. Displays an array of tab components that consist of the content
 * to display, a title, and a subtitle.
 *
 * @param {TabbedCardProps} props - the component props
 */
function TabbedCard(props: TabbedCardProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [selectedTabFromVar, setSelectedTabFromVar] = useVariable(props.selected_tab);
    const [selectedTab, setSelectedTab] = useState(() =>
        getTabHeader(props.children, selectedTabFromVar ?? props.initial_tab)
    );
    const [selectedCard, setSelectedCard] = useState(getCardBody(props.children, selectedTab.title));

    useEffect(() => {
        const updatedSelectedTab = getTabHeader(props.children, selectedTabFromVar || props.initial_tab);
        if (updatedSelectedTab !== selectedTab) {
            setSelectedTab(updatedSelectedTab);
            setSelectedCard(getCardBody(props.children, updatedSelectedTab.title));
        }
    }, [selectedTabFromVar, useDeepCompare(props.children)]);

    const tabs = props.children.map((tab: TabProps) => mapTabProps(tab));
    const onSelectTab = (tab: Tab): void => {
        setSelectedTabFromVar(tab.title);
        setSelectedTab(tab);
        setSelectedCard(getCardBody(props.children, tab.title));
    };

    return (
        <TabbedCardWrapper $rawCss={css} style={style} id={props.id_}>
            <Tabs<Tab> onSelectTab={onSelectTab as any} selectedTab={selectedTab} tabs={tabs} />
            <Card data-active-tab={selectedTab.title} data-type="children-wrapper">
                <DisplayCtx.Provider value={{ component: 'tabbedcard', direction: 'vertical' }}>
                    {selectedCard.map((child: ComponentInstance, idx: number) => (
                        <DynamicComponent component={child} key={`card-${idx}-${selectedTab.title}`} />
                    ))}
                </DisplayCtx.Provider>
            </Card>
        </TabbedCardWrapper>
    );
}

export default TabbedCard;
