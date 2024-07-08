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
import { Collapse } from 'react-collapse';

import styled from '@darajs/styled-components';

import { AccordionItemType } from '../types';
import { Chevron } from '../utils';

interface WrapperProps {
    backgroundColor?: string;
}

const AccordionItemWrapper = styled.div<WrapperProps>`
    width: 100%;
    background-color: ${(props) => props.backgroundColor ?? props.theme.colors.blue1};
    border: 1px solid ${(props) => props.theme.colors.grey1};
    border-radius: 0.25rem;

    /* Define the animation used for collapsing */
    /* stylelint-disable-next-line -- external classname */
    .ReactCollapse--collapse {
        transition: height 0.35s ease;
    }
`;

interface AccordionLabelProps {
    isOpen: boolean;
}

const AccordionLabel = styled.dt<AccordionLabelProps>`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    padding: 0.5rem 1rem;

    font-size: 1.2em;
    font-weight: 400;
    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.grey1};
    border: none;
    border-radius: ${(props) => (props.isOpen ? '0.25rem 0.25rem 0rem 0rem' : '0.25rem')};

    &:hover {
        background-color: ${(props) => props.theme.colors.grey2};
    }

    &:active {
        background-color: ${(props) => props.theme.colors.grey3};
    }
`;

const ContentWrapper = styled.dd`
    overflow: hidden;

    width: 100%;
    height: 100%;

    /*
    We have to use padding for the gap between items rather than margin
    because margin doesn't work well with react-collapse and causes jumping
    See: https://github.com/nkbt/react-collapse#behaviour-notes
    */
    margin: 0;
    padding: 1rem;
`;

const AccordionContent = styled.div`
    display: flex;

    height: auto;

    font-size: 1em;
    font-weight: 300;
    color: ${(props) => props.theme.colors.text};
`;

export interface AccordionItemProps {
    /** Background color to set to match the surrounding */
    backgroundColor?: string;
    /** Optional function for rendering the header row; accepts the label */
    headerRenderer?: (item: AccordionItemType) => JSX.Element;
    /** Optional function for rendering the content; accepts the item */
    innerRenderer?: (item: AccordionItemType) => JSX.Element;
    /** Item containing label and content */
    item: any;
    /** Optional handler for handling clicking the header */
    onClick?: (e?: React.SyntheticEvent<HTMLElement | SVGSVGElement>) => void | Promise<void>;
    /** Flag that specifies whether item is open or close */
    open: boolean;
}

/**
 * The component renders each item of the accordion. It accepts optional headerRenderer and innerRenderer
 * for rendering the header and content
 *
 * @param {AccordionItemProps} props - the component props
 */
function AccordionItem({
    backgroundColor,
    headerRenderer,
    innerRenderer,
    item,
    onClick,
    open,
}: AccordionItemProps): JSX.Element {
    return (
        <AccordionItemWrapper backgroundColor={backgroundColor} key={item.label}>
            <AccordionLabel isOpen={open} onClick={onClick}>
                {headerRenderer ? headerRenderer(item) : item.label}
                <Chevron isOpen={open} />
            </AccordionLabel>
            <Collapse isOpened={open}>
                <ContentWrapper>
                    <AccordionContent>{innerRenderer ? innerRenderer(item) : item.content}</AccordionContent>
                </ContentWrapper>
            </Collapse>
        </AccordionItemWrapper>
    );
}

export default AccordionItem;
