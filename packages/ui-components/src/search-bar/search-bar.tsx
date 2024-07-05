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
import * as React from 'react';

import styled from '@darajs/styled-components';
import { MagnifyingGlass } from '@darajs/ui-icons';

import Input from '../input/input';
import { InteractiveComponentProps } from '../types';

const Wrapper = styled.div`
    display: flex;
    margin: 0 0.5rem;
`;

const SearchBarComponent = styled(Input)`
    input {
        padding-right: 2.25rem;
    }

    :hover:not(:disabled) {
        input {
            border: 1px solid ${(props) => props.theme.colors.grey3};
        }
    }
`;

const SearchBarIcon = styled(MagnifyingGlass)`
    position: relative;
    top: 0.625rem;
    right: 1.75rem;

    height: 1.25rem;

    color: ${(props) => props.theme.colors.grey4};
`;

export interface SearchBarProps extends InteractiveComponentProps<string> {
    /** An optional maximum length */
    maxLength?: number;
    /** An optional onChange handler for listening to changes in the input */
    onChange?: (value: string, e?: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional placeholder that will be used when the input is empty, defaults to '' */
    placeholder?: string;
}

/**
 * A search bar component, accepts an onChange handler to listen for changes.
 *
 * @param props - the component props
 */
function SearchBar(props: SearchBarProps): JSX.Element {
    return (
        <Wrapper>
            <SearchBarComponent
                className={props.className}
                disabled={props.disabled}
                maxLength={props.maxLength}
                onChange={props.onChange}
                placeholder={props.placeholder ?? 'Search'}
                style={props.style}
                value={props.value}
            />
            <SearchBarIcon />
        </Wrapper>
    );
}

export default SearchBar;
