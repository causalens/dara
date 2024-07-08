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
import debounce from 'lodash/debounce';
import { SyntheticEvent, useContext, useRef, useState } from 'react';

import styled from '@darajs/styled-components';
import { Button, Input, Tooltip } from '@darajs/ui-components';
import { ArrowDown, ArrowUp, Cross, Search } from '@darajs/ui-icons';
import { useOnClickOutside, useUpdateEffect } from '@darajs/ui-utils';

import PointerContext from '../../pointer-context';
import { FloatingButton } from '../floating-elements';

interface FloatingSearchBarProps {
    /**
     * Called when a user types text in the search bar.
     * The call to this function is debounced to avoid update search results mid-typing.
     * */
    onChange?: (value: string, e?: SyntheticEvent<HTMLInputElement, Event>) => void | Promise<void>;
    /** Called when search bar is closed */
    onClose?: () => void | Promise<void>;
    /** Called on click of the down arrow button */
    onNext?: () => void | Promise<void>;
    /**  Called on click of the up arrow button */
    onPrev?: () => void | Promise<void>;
    /** The index of the selected result */
    selectedResult?: number;
    /** The total number of available search results */
    totalNumberOfResults?: number;
}

const Results = styled.span`
    pointer-events: none;

    position: absolute;
    top: 0;
    right: 5.5rem;

    line-height: 40px;
    color: ${(props) => props.theme.colors.text};
`;

const OpenSearchButton = styled(FloatingButton)`
    position: absolute;
    z-index: 2;
    top: 0;
    right: 0;

    transition: opacity 0.3s;
`;

const InsideButton = styled(Button)`
    position: absolute;
    top: 10px;

    min-width: 0;
    height: 20px;
    margin: 0;
    padding: 0 0.25rem;

    background: transparent;

    transition: opacity 0.3s;
`;

const OpenSearchWrapper = styled.div`
    position: relative;
    transform-origin: right;
    overflow: hidden;
    transition:
        opacity 0.3s,
        width 0.3s;
`;

const SearchInput = styled(Input)`
    position: relative;
    width: 300px;
    height: 40px;

    input {
        width: 100%;
        height: 100%;
        padding-right: 10rem;
        box-shadow: ${(props) => props.theme.shadow.light};
    }
`;

const inputDebounceValue = 200;

function FloatingSearchBar(props: FloatingSearchBarProps): JSX.Element {
    const { disablePointerEvents } = useContext(PointerContext);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [showResultCount, setShowResultCount] = useState(false);
    const [showSearchBar, setShowSearchBar] = useState(false);
    const [searchInput, setSearchInput] = useState('');

    function onSearchChange(val: string): void {
        setSearchInput(val);

        if (val && val !== '') {
            setShowResultCount(true);
        } else {
            setShowResultCount(false);
        }
    }

    const debouncedOnChange = debounce((val: string, e?: SyntheticEvent<HTMLInputElement, Event>) => {
        props.onChange(val, e);
    }, inputDebounceValue);

    useUpdateEffect(() => {
        debouncedOnChange(searchInput);
    }, [searchInput]);

    const wrapperRef = useRef<HTMLDivElement>(null);
    useOnClickOutside(wrapperRef.current, () => {
        if (!showResultCount) {
            setShowSearchBar(false);
        }
    });

    function onEnter(): void {
        if (props.totalNumberOfResults) {
            props.onNext();
        }
    }

    function onOpenSearch(): void {
        setShowSearchBar(true);
        searchInputRef.current.focus();
    }

    function onClose(): void {
        setSearchInput('');
        setShowSearchBar(false);
        setShowResultCount(false);
        props.onClose();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
        if (e.key === 'Escape') {
            onClose();
        }
        if (e.key === 'ArrowDown') {
            props.onNext();
        }
        if (e.key === 'ArrowUp') {
            props.onPrev();
        }
    }

    let resultsText = '0 results';

    if (props.totalNumberOfResults) {
        resultsText = `${props.selectedResult}/${props.totalNumberOfResults}`;
    }

    let results: JSX.Element = null;

    if (showResultCount) {
        results = (
            <>
                <Results>{resultsText}</Results>

                <InsideButton
                    aria-label="Next item"
                    onClick={props.onNext}
                    style={{
                        opacity: showSearchBar ? 1 : 0,
                        right: '3.5rem',
                    }}
                    styling="ghost"
                >
                    <ArrowDown />
                </InsideButton>
                <InsideButton
                    aria-label="Previous item"
                    onClick={props.onPrev}
                    style={{
                        opacity: showSearchBar ? 1 : 0,
                        right: '2.25rem',
                    }}
                    styling="ghost"
                >
                    <ArrowUp />
                </InsideButton>
            </>
        );
    }

    return (
        <div
            ref={wrapperRef}
            style={{
                position: 'relative',
            }}
        >
            <Tooltip content="Search Nodes" placement="bottom">
                <OpenSearchButton
                    disableEvents={disablePointerEvents}
                    fixedSize
                    onClick={onOpenSearch}
                    style={{
                        opacity: showSearchBar ? 0 : 1,
                        pointerEvents: showSearchBar || disablePointerEvents ? 'none' : 'all',
                    }}
                >
                    <Search />
                </OpenSearchButton>
            </Tooltip>
            <OpenSearchWrapper
                style={{
                    opacity: showSearchBar ? 1 : 0,
                    pointerEvents: !showSearchBar || disablePointerEvents ? 'none' : 'all',
                    // scale from button width to input width
                    width: showSearchBar ? '300px' : '40px',
                    zIndex: 1,
                }}
            >
                <SearchInput
                    onChange={onSearchChange}
                    onComplete={onEnter}
                    onKeyDown={onKeyDown}
                    placeholder="Search..."
                    ref={searchInputRef}
                    type="text"
                    value={searchInput}
                />
                {results}
                <InsideButton
                    aria-label="Close search bar"
                    onClick={onClose}
                    style={{
                        opacity: showSearchBar ? 1 : 0,
                        right: '0.75rem',
                    }}
                    styling="ghost"
                >
                    <Cross />
                </InsideButton>
            </OpenSearchWrapper>
        </div>
    );
}

export default FloatingSearchBar;
