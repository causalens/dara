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
import castArray from 'lodash/castArray';
import React, { useCallback, useEffect, useState } from 'react';

import styled from '@darajs/styled-components';
import { CheckSquare } from '@darajs/ui-icons';

import { ComponentSelectItem } from '../types';

interface WrapperProps {
    itemsPerRow?: number;
}

const Wrapper = styled.div<WrapperProps>`
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(${(props) => props.itemsPerRow}, 1fr);

    max-height: 100%;
    margin: 2rem;
    padding: 1rem;

    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.grey1};
    border-radius: 0.25rem;
`;

interface selectedProp {
    selected: boolean;
}

const Card = styled.div<selectedProp>`
    cursor: pointer;

    position: relative;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    margin: 1rem;
    padding: 1rem;

    text-align: center;

    background-color: ${(props) => props.theme.colors.blue1};
    border: ${(props) => `2px solid ${props.selected ? props.theme.colors.primary : 'transparent'}`};
    border-radius: 0.25rem;

    :hover {
        border: ${(props) => `2px solid ${props.selected ? props.theme.colors.primary : props.theme.colors.grey3}`};
    }
`;

const CardTitle = styled.h2`
    margin-top: 1rem;
`;

const CardSubtitle = styled.h4`
    margin-top: 1rem;
    color: ${(props) => props.theme.colors.grey6};
`;

const StyledCheckSquare = styled(CheckSquare)`
    cursor: pointer;

    position: absolute;
    z-index: 3;
    top: 10px;
    right: 10px;

    color: ${(props) => props.theme.colors.primary};
`;

const ComponentWrapper = styled.div`
    cursor: pointer;
    display: flex;
    width: 100%;
`;

/**
 * Helper function to get the index of the selected item in the items array
 *
 * @param selectedItems the item that is selected
 * @param item the array of items to find the index in
 */
function getSelectedIndex(selectedItems: Array<string>, item: ComponentSelectItem): number {
    return selectedItems.findIndex((selectedItem) => selectedItem === item.title);
}

/**
 * Helper function for updating the selected items once a card is clicked
 *
 * @param prevSelections the previously selected card
 * @param item the currently clicked card
 * @param multiSelect flag for allowing multi selection
 */
function updateSelectedItems(
    prevSelections: Array<string>,
    item: ComponentSelectItem,
    multiSelect: boolean
): Array<string> {
    const selectedIndex = getSelectedIndex(prevSelections, item);
    // Remove from selections if item is already selected
    if (selectedIndex > -1) {
        return prevSelections.filter((_, index) => index !== selectedIndex);
    }
    // Add to selection if multi-select is allowed
    if (multiSelect) {
        return [...prevSelections, item.title];
    }
    return [item.title];
}

export interface ComponentSelectListProps {
    /** Standard react className property */
    className?: string;
    /** The items to display, each should have a title, subtitle and component */
    items: Array<ComponentSelectItem>;
    /** An optional prop to specify the number of items per row, 3 by default */
    itemsPerRow?: number;
    /** An optional flag for allowing selecting multiple cards, false by default */
    multiSelect?: boolean;
    /** An optional onSelect handler for listening to changes in the selected items */
    onSelect?: (items: Array<string>) => void | Promise<void>;
    /** The optional selected items, can be an array of titles if multiSelect is true otherwise a title */
    selectedItems?: Array<string>;
    /** Pass through of style property to the root element */
    style?: React.CSSProperties;
}

/**
 * The ComponentSelectList component creates a list of card of selectable cards containing either images or plots.
 * The plot should be passed as a JSX element.
 *
 * @param props the component props
 */
function ComponentSelectList(props: ComponentSelectListProps): JSX.Element {
    const [selectedCards, setSelectedCards] = useState<Array<string>>(
        props.selectedItems ? castArray(props.selectedItems) : []
    );

    useEffect(() => {
        setSelectedCards(props.selectedItems ? castArray(props.selectedItems) : []);
    }, [props.selectedItems]);

    const onClick = useCallback(
        (index: number) => {
            const updatedSelectedCards = updateSelectedItems(selectedCards, props.items[index], props.multiSelect);
            setSelectedCards(updatedSelectedCards);
            props.onSelect?.(updatedSelectedCards);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [props.items, props.multiSelect, selectedCards, setSelectedCards]
    );

    return (
        <Wrapper
            className={props.className}
            itemsPerRow={props.itemsPerRow && props.itemsPerRow > 0 ? props.itemsPerRow : 3}
            style={props.style}
        >
            {props.items.map((item, index) => (
                <Card
                    key={`${item.title}-${index}`}
                    onClick={() => onClick(index)}
                    selected={getSelectedIndex(selectedCards, item) > -1}
                >
                    {getSelectedIndex(selectedCards, item) > -1 && <StyledCheckSquare size="2x" />}
                    <ComponentWrapper>{item.component}</ComponentWrapper>
                    <CardTitle>{item.title}</CardTitle>
                    {item.subtitle && <CardSubtitle>{item.subtitle}</CardSubtitle>}
                </Card>
            ))}
        </Wrapper>
    );
}

export default ComponentSelectList;
