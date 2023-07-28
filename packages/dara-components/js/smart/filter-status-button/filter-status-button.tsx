import * as React from 'react';
import ReactDOM from 'react-dom';

import { Action, Variable, useAction, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';
import { Filter } from '@darajs/ui-icons';

const StyledButton = styled.button<{ $active: boolean; $top?: string }>`
    cursor: pointer;
    user-select: none;

    position: fixed;
    z-index: 10000;
    top: ${(props) => props.$top ?? '5%'};
    right: 0;
    transform: translateX(calc(100% - 32px));

    display: flex;
    gap: 1rem;
    align-items: center;

    height: 2.5rem;
    padding: 0 1rem;

    font-size: ${(props) => props.theme.font.size};
    color: ${(props) => (props.$active ? props.theme.colors.blue4 : props.theme.colors.background)};

    background-color: ${(props) => (props.$active ? props.theme.colors.primary : props.theme.colors.primaryHover)};
    border: none;

    transition: transform 0.35s ease;

    svg {
        margin-left: -0.3rem;
        color: ${(props) => (props.$active ? props.theme.colors.blue4 : props.theme.colors.background)};
    }

    :hover {
        transform: none;
    }
`;

interface FilterStats {
    active_filters: number;
    current_rows: number;
    max_rows: number;
}

interface FilterStatusButtonProps {
    filter_stats: Variable<FilterStats>;
    on_click: Action;
    top_position: string;
}

function FilterStatusButton(props: FilterStatusButtonProps): JSX.Element {
    const [filterStats] = useVariable(props.filter_stats);
    const [onClick] = useAction(props.on_click);

    function clickHandler(): void {
        onClick(null);
    }

    return ReactDOM.createPortal(
        <StyledButton
            $active={filterStats.active_filters > 0}
            $top={props.top_position}
            onClick={clickHandler}
            type="button"
        >
            <Filter />
            <span>
                {filterStats.active_filters} filter{filterStats.active_filters === 1 ? '' : 's'}
            </span>
            <span>
                {filterStats.current_rows} / {filterStats.max_rows} rows
            </span>
        </StyledButton>,
        document.body
    );
}

export default FilterStatusButton;
