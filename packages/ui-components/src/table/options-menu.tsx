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
import {
    autoUpdate,
    flip,
    shift,
    useClick,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import { faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { FunctionComponent, useCallback, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { ColumnInstance, Filters } from 'react-table';

import styled from '@darajs/styled-components';

import SectionedList, { ListSection } from '../sectioned-list/sectioned-list';
import { Item } from '../types';
import { List } from '../utils';

const HeaderOptionsIcon = styled(FontAwesomeIcon)`
    cursor: pointer;
    align-items: center;
    color: ${(props) => props.theme.colors.grey5};
`;

const HeaderOptions = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 12px;

    background-color: ${(props) => props.theme.colors.grey3};
`;

const OptionsDropdownList = styled(List)`
    background-color: ${(props) => props.theme.colors.background};
    box-shadow: ${(props) => props.theme.shadow.light};
`;

interface OptionsMenuProps {
    /** all columns from the table component */
    allColumns: ColumnInstance<any>[];
    /** Optional flag to enable column hiding */
    allowColumnHiding?: boolean;
    /** count of currently visible columns */
    numVisibleColumns: number;
    /** column resizing reset function callback from useTable */
    resetResizing: () => void;
    /** filter setter from useTable */
    setAllFilters: (updater: Filters<any> | ((filters: Filters<any>) => Filters<any>)) => void;
    /** Pass through of the style prop to the table options Dropdown */
    style: React.CSSProperties;
}

/**
 * The OptionsMenu component adds a sectioned list menu to the Table component.
 * It inherits the ability to reset column widths and filters from react-table's useTable hook
 *
 * @param props - the component props
 */
const OptionsMenu: FunctionComponent<OptionsMenuProps> = ({
    allColumns,
    allowColumnHiding,
    numVisibleColumns,
    resetResizing,
    setAllFilters,
    style,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleOptions = useCallback((): void => {
        setIsOpen((prev) => !prev);
    }, []);

    const onOptionSelect = useCallback((option: Item): void => {
        option.onClick();
        setIsOpen(false);
    }, []);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        placement: 'left-end',
        middleware: [flip(), shift()],
        whileElementsMounted: isOpen ? autoUpdate : undefined,
    });

    const interactions = useInteractions([
        useClick(context, { event: 'mousedown' }),
        useDismiss(context, { outsidePress: true, outsidePressEvent: 'mousedown' }),
        useRole(context, { role: 'menu' }),
    ]);

    const resetFunctions: ListSection = useMemo(() => {
        const functions = {
            items: [
                {
                    label: 'Reset Column Widths',
                    onClick: resetResizing,
                    value: 'resetResizing',
                },
                {
                    label: 'Reset Filters',
                    onClick: () => setAllFilters([]),
                    value: 'resetFilters',
                },
            ],
            label: 'Reset',
        };
        if (allowColumnHiding) {
            functions.items.push({
                label: 'Show All Columns',
                onClick: () => {
                    allColumns.forEach((column) => {
                        if (!column.isVisible) {
                            column.toggleHidden();
                        }
                    });
                },
                value: 'showAllColumns',
            });
        }

        return functions;
    }, [resetResizing, setAllFilters, allColumns, allowColumnHiding]);

    const columnToggles: ListSection = useMemo(() => {
        return {
            items: allColumns
                .filter((column) => typeof column.Header === 'string')
                .map((column) => ({
                    label: `${column.isVisible ? 'Hide' : 'Show'} ${String(column.Header)}`,
                    onClick: () =>
                        /* Don't allow last visible column to be hidden */
                        !(column.isVisible && numVisibleColumns === 1) ? column.toggleHidden() : null,
                    value: `${column.isVisible ? 'hide' : 'show'}${String(column.Header)}`,
                })),
            label: 'Columns',
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allColumns, allowColumnHiding, numVisibleColumns]);

    return (
        <HeaderOptions ref={refs.setReference}>
            <HeaderOptionsIcon icon={faEllipsisV} onClick={toggleOptions} />
            {ReactDOM.createPortal(
                <OptionsDropdownList
                    {...interactions.getFloatingProps({
                        ref: refs.setFloating,
                        style: {
                            ...floatingStyles,
                            maxHeight: 800,
                            minWidth: 150,
                            zIndex: 9999,
                            ...style,
                        },
                    })}
                    isOpen={isOpen}
                >
                    <SectionedList
                        key={isOpen ? 'open' : 'closed'} // Resets the selected item when the options menu is closed
                        items={allowColumnHiding ? [resetFunctions, columnToggles] : [resetFunctions]}
                        onSelect={onOptionSelect}
                    />
                </OptionsDropdownList>,
                document.body
            )}
        </HeaderOptions>
    );
};

export default OptionsMenu;
