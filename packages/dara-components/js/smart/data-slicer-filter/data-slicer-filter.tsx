/* eslint-disable no-underscore-dangle */
import { formatISO, parseISO } from 'date-fns';
import { produce } from 'immer';
import debounce from 'lodash/debounce';
import { nanoid } from 'nanoid';
import { useMemo } from 'react';

import { Variable, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';
import { Button, DatePicker, Input, Item, Select } from '@darajs/ui-components';
import { Cross, Plus } from '@darajs/ui-icons';

enum ColumnType {
    CATEGORICAL = 'categorical',
    DATETIME = 'datetime',
    NUMERICAL = 'numerical',
}

interface Column {
    name: string;
    type: ColumnType;
}

interface FilterInstance {
    /**
     * Used internally to uniquely identify filters - prevents us from having to rely on indexes
     */
    __id: string;
    column: string;
    from_date: string;
    range: string;
    to_date: string;
    values: string;
}

const ColumnSelect = styled(Select)`
    flex-basis: 15rem;
`;

const FilterLabel = styled.span`
    flex-basis: 50px;
`;

const AddFilterButton = styled(Button)`
    flex-shrink: 0;
    width: max-content;

    svg {
        margin-right: 0.5rem;
        color: ${(props) => props.theme.colors.blue1};
    }
`;

const RemoveFilterButton = styled(Cross)`
    color: ${(props) => props.theme.colors.error};

    :hover {
        color: ${(props) => props.theme.colors.errorHover};
    }
`;

const SlicerFilterWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    justify-content: space-between;
`;

const FiltersWrapper = styled.div`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    height: 100%;
    margin-bottom: 1rem;
    padding: 2rem 0;

    box-shadow: ${(props) => props.theme.shadow.light};
`;

const FilterRow = styled.div`
    display: flex;
    gap: 1rem;
    align-items: center;
`;

/**
 * Parse a date value into a date
 *
 * @param date date to parse
 */
export function parseDateString(date: string | Date): Date {
    if (!date) {
        return;
    }
    if (date instanceof Date) {
        return date;
    }
    const parsed = parseISO(date);
    if (Number.isNaN(parsed.getTime())) {
        return;
    }
    return parsed;
}

interface DataSlicerFilterProps {
    /**
     * List of available columns
     */
    columns: Variable<Column[]>;
    /**
     * Variable holding a list of filters
     */
    filters: Variable<FilterInstance[]>;
    /**
     * Height of the filter component
     */
    height: string;
}

type FilterUpdater = (updater: (f: FilterInstance[]) => void) => void;

/**
 * DataSlicerFilter displays an editable list of filters to apply to a dataset
 */
function DataSlicerFilter(props: DataSlicerFilterProps): JSX.Element {
    const [columns] = useVariable(props.columns);
    const [filters, setFilters] = useVariable(props.filters);

    const columnItems = useMemo<Item[]>(() => {
        return columns.map((c) => ({ label: c.name, value: c.name }));
    }, [columns]);
    const columnMap = useMemo<Map<string, ColumnType>>(() => {
        return columns.reduce((acc, c) => acc.set(c.name, c.type), new Map());
    }, [columns]);

    const updateFilter = useMemo(
        () =>
            debounce((id: string, property: keyof FilterInstance, value: string): void => {
                // The typing on useVariable is slightly off but it does accept an updater function for plain variables
                // Note: This will only work for plain variables!
                (setFilters as unknown as FilterUpdater)((currentFilters) =>
                    produce(currentFilters, (draft) => {
                        const filter = draft.find((d) => d.__id === id);
                        filter[property] = value;
                    })
                );
            }, 500),
        []
    );

    function addFilter(): void {
        setFilters(
            produce(filters, (draft) => {
                draft.push({
                    __id: nanoid(),
                    column: null,
                    from_date: '',
                    range: '',
                    to_date: '',
                    values: '',
                });
            })
        );
    }

    function removeFilter(id: string): void {
        setFilters(
            produce(filters, (draft) => {
                const fIndex = draft.findIndex((f) => f.__id === id);
                draft.splice(fIndex, 1);
            })
        );
    }

    return (
        <SlicerFilterWrapper style={{ height: props.height ?? '85%' }}>
            <FiltersWrapper>
                {filters.length === 0 && <span>No filters</span>}
                {filters.map((f) => (
                    <FilterRow key={f.__id}>
                        <RemoveFilterButton asButton onClick={() => removeFilter(f.__id)} />
                        <FilterLabel>Variable</FilterLabel>
                        <ColumnSelect
                            initialValue={columnItems.find((ci) => ci.value === f.column)}
                            items={columnItems}
                            onSelect={(i) => updateFilter(f.__id, 'column', i.value)}
                        />
                        {f.column && (
                            <>
                                {columnMap.get(f.column) === ColumnType.DATETIME && (
                                    <>
                                        <FilterLabel>From</FilterLabel>
                                        <DatePicker
                                            initialValue={parseDateString(f.from_date)}
                                            onChange={(v: Date) => updateFilter(f.__id, 'from_date', formatISO(v))}
                                            shouldCloseOnSelect
                                            showTimeInput
                                        />
                                        <FilterLabel>To</FilterLabel>
                                        <DatePicker
                                            initialValue={parseDateString(f.to_date)}
                                            onChange={(v: Date) => updateFilter(f.__id, 'to_date', formatISO(v))}
                                            shouldCloseOnSelect
                                            showTimeInput
                                        />
                                    </>
                                )}
                                {[ColumnType.CATEGORICAL, ColumnType.NUMERICAL].includes(columnMap.get(f.column)) && (
                                    <>
                                        <FilterLabel>Values</FilterLabel>
                                        <Input
                                            initialValue={f.values}
                                            onChange={(v) => updateFilter(f.__id, 'values', v)}
                                        />
                                    </>
                                )}
                                {columnMap.get(f.column) === ColumnType.NUMERICAL && (
                                    <>
                                        <FilterLabel>or range</FilterLabel>
                                        <Input
                                            initialValue={f.range}
                                            onChange={(v) => updateFilter(f.__id, 'range', v)}
                                        />
                                    </>
                                )}
                            </>
                        )}
                    </FilterRow>
                ))}
            </FiltersWrapper>
            <AddFilterButton onClick={addFilter}>
                <Plus />
                Add Filter
            </AddFilterButton>
        </SlicerFilterWrapper>
    );
}

export default DataSlicerFilter;
