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
import { useCallback, useEffect, useState } from 'react';

import styled from '@darajs/styled-components';

import { AccordionItemType } from '../types';
import AccordionItem from './accordion-item';

const AccordionWrapper = styled.dl`
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;

    width: 100%;
    height: 100%;
`;
export interface AccordionProps {
    /** Background color to set to match the surrounding */
    backgroundColor?: string;
    /** Standard react className property */
    className?: string;
    /** Optional function for rendering the header row; accepts the item */
    headerRenderer?: (item: AccordionItemType) => JSX.Element;
    /** Optional prop to specify which item(s) to open initially; should be its index in the array */
    initialOpenItems?: Array<number> | number;
    /** Optional function for rendering the content; accepts the item */
    innerRenderer?: (item: AccordionItemType) => JSX.Element;
    /** Array of items containing label and content */
    items?: Array<AccordionItemType>;
    /** defines whether to only be able to open one item at a time defaults to true */
    multi?: boolean;
    /** onChange event. */
    onChange?: (openItems: Array<number> | number) => void | Promise<void>;
    /** Pass through of style property to the wrapper element */
    style?: React.CSSProperties;
    /** Optional prop to put the component in controlled mode */
    value?: Array<number> | number;
}

function getInitialOpen(
    initialItems: Array<number> | number,
    value: Array<number> | number,
    itemsArray: Array<AccordionItemType>
): Array<boolean> {
    if (value !== undefined) {
        const initialOpen = Array.isArray(value) ? value : [value];
        return itemsArray.map((item, index) => {
            return initialOpen.includes(index);
        });
    }
    if (initialItems !== undefined) {
        const initialOpen = Array.isArray(initialItems) ? initialItems : [initialItems];
        return itemsArray.map((item, index) => {
            return initialOpen.includes(index);
        });
    }
    return new Array(itemsArray.length).fill(false);
}

/**
 * An accordion component that accepts an array of items as well as optional headerRenderer
 * for rendering the header row and optional innerRenderer for rendering the content
 *
 * @param {AccordionProps} props - the component props
 */
function Accordion({
    backgroundColor,
    className,
    initialOpenItems,
    headerRenderer,
    innerRenderer,
    items,
    style,
    multi = true,
    onChange,
    value,
}: AccordionProps): JSX.Element {
    const [openItems, setOpenItems] = useState<boolean[]>(getInitialOpen(initialOpenItems, value, items));

    const onClick = useCallback(
        (index: number): void => {
            let newOpenItems = openItems;
            if (!multi) {
                newOpenItems = openItems.map((item, idx) => {
                    if (idx === index) {
                        return !item;
                    }
                    return false;
                });
            } else {
                newOpenItems[index] = !openItems[index];
            }
            // gets a list of boolean and returns the indexes of the true values
            const chosenItems = newOpenItems.reduce((acc, curr, idx) => {
                if (curr) {
                    acc.push(idx);
                }
                return acc;
            }, [] as number[]);
            onChange?.([...chosenItems]);
            // uncontrolled component
            if (value === undefined) {
                setOpenItems([...newOpenItems]);
            }
        },
        [multi, onChange, openItems, value]
    );

    useEffect(() => {
        setOpenItems(getInitialOpen(initialOpenItems, value, items));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <AccordionWrapper className={className} style={style}>
            {items.map((item, index) => (
                <AccordionItem
                    backgroundColor={backgroundColor}
                    headerRenderer={headerRenderer}
                    innerRenderer={innerRenderer}
                    item={item}
                    key={`accordion-item-${index}`}
                    onClick={() => onClick(index)}
                    open={openItems[index]}
                />
            ))}
        </AccordionWrapper>
    );
}

export default Accordion;
