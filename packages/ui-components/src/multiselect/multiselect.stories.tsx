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
import { Meta } from '@storybook/react';
import { useCallback, useMemo, useState } from 'react';
import { isEqual } from 'lodash';

import { default as MultiSelectComponent, MultiSelectProps } from './multiselect';
import { Item } from '../types';

export default {
    component: MultiSelectComponent,
    title: 'UI Components/Multi Select',
} as Meta;

const sampleItems = [
    {
        label: 'this is an extremely long label that may overflow',
        value: 'value 1',
    },
    {
        label: 'label 2',
        value: 'value 2',
    },
    {
        label: 'label 3',
        value: 'value 3',
    },
    {
        label: 'label 4',
        value: 'value 4',
    },
    {
        label: 'label 5',
        value: 'value 5',
    },
    {
        label: 'label 6',
        value: 'value 6',
    },
    {
        label: 'label 7',
        value: 'value 7',
    },
    {
        label: 'label 8',
        value: 'value 8',
    },
    {
        label: 'label 9',
        value: 'value 9',
    },
    {
        label: 'label 10',
        value: 'value 10',
    },
];

export const MultiSelect = (args: MultiSelectProps): JSX.Element => <MultiSelectComponent {...args} />;

MultiSelect.args = {
    items: sampleItems,
    maxRows: 3,
    maxWidth: '20rem',
    onTermChange: undefined,
    size: 1,
} as MultiSelectProps;

/**
 * Multiple MultiSelects with different error states for tooltip testing
 */
export const MultiSelectTooltipShowcase = (): JSX.Element => (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div>
            <h3>Normal MultiSelect (no error)</h3>
            <MultiSelectComponent
                items={sampleItems.slice(0, 5)}
                placeholder="Normal multiselect..."
                maxRows={2}
                maxWidth="20rem"
                size={1}
            />
        </div>
        
        <div>
            <h3>MultiSelect with Short Error Message</h3>
            <MultiSelectComponent
                items={sampleItems.slice(0, 5)}
                errorMsg="An error message"
                placeholder="Hover to see error tooltip..."
                maxRows={2}
                maxWidth="20rem"
                size={1}
            />
        </div>
        
        <div>
            <h3>MultiSelect with Long Error Message</h3>
            <MultiSelectComponent
                items={sampleItems.slice(0, 5)}
                errorMsg="This is a very long error message that should wrap nicely in the tooltip and demonstrate how the floating-ui tooltip handles longer content with proper positioning and styling"
                placeholder="Hover for long error tooltip..."
                maxRows={2}
                maxWidth="20rem"
                size={1}
            />
        </div>
        
        <div>
            <h3>Disabled MultiSelect with Error</h3>
            <MultiSelectComponent
                items={sampleItems.slice(0, 5)}
                errorMsg="Another error message"
                placeholder="Disabled with error..."
                disabled
                maxRows={2}
                maxWidth="20rem"
                size={1}
            />
        </div>
    </div>
);

/**
 * Controlled MultiSelect story that demonstrates the component in controlled mode,
 * similar to how the Dara Select component works with state management and callbacks.
 */
export const ControlledMultiSelect = (): JSX.Element => {
    const [selectedValues, setSelectedValues] = useState<unknown[]>(['value 2', 'value 5']);
    
    // Convert values to items, similar to getMultiselectItems function
    const getMultiselectItems = useCallback((values: unknown[], items: Item[]): Item[] => {
        if (!values) {
            return [];
        }
        
        return items.reduce((acc: Item[], item: Item) => {
            const stringOfValues = values.map(String);
            if (stringOfValues.includes(String(item.value))) {
                return [...acc, item];
            }
            return acc;
        }, []);
    }, []);
    
    // Convert a value to an Item, similar to toItem function in Select
    const toItem = useCallback((val: unknown): Item | null => {
        // Type guard for primitive values to avoid "[object Object]" string conversion
        const isPrimitive = (value: unknown): value is string | number | boolean | null | undefined => 
            value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
        
        const matchingItem = sampleItems.find((item) => {
            if (isPrimitive(item.value) && isPrimitive(val)) {
                return String(item.value) === String(val);
            }
            return false;
        });
        if (matchingItem) {
            return matchingItem;
        }
        // Return the item as an Item type with the value as the label, only for primitives
        return isPrimitive(val) ? { label: String(val), value: val } : null;
    }, []);
    
    const selectedItems = useMemo(() => {
        const found = getMultiselectItems(selectedValues, sampleItems);
        const explicitValues = selectedValues.map(toItem).filter((item): item is Item => item !== null);
        return found.length > 0 ? found : explicitValues;
    }, [selectedValues, getMultiselectItems, toItem]);
    
    // Filter out already selected items from the dropdown
    const availableItems = useMemo(() => {
        const selectedValueStrings = selectedValues.map(String);
        return sampleItems.filter(item => !selectedValueStrings.includes(String(item.value)));
    }, [selectedValues]);
    
    const onSelect = useCallback((items: Item[]) => {
        const currentSelection = items.map((item: Item) => item.value);
        if (!isEqual(currentSelection, selectedValues)) {
            setSelectedValues(currentSelection);
            console.log('Selection changed:', currentSelection); // eslint-disable-line no-console
        }
    }, [selectedValues]);
    
    const onTermChange = useCallback((term: string) => {
        console.log('Search term changed:', term); // eslint-disable-line no-console
    }, []);
    
    return (
        <div style={{ padding: '2rem' }}>
            <h3>Controlled MultiSelect (Dara-style)</h3>
            <p>Current selection: {JSON.stringify(selectedValues)}</p>
            <MultiSelectComponent
                items={availableItems}
                selectedItems={selectedItems}
                onSelect={onSelect}
                onTermChange={onTermChange}
                placeholder="Select multiple items..."
                maxRows={4}
                maxWidth="25rem"
                size={1}
            />
            <div style={{ marginTop: '1rem' }}>
                <button 
                    type="button"
                    onClick={() => setSelectedValues(['value 1', 'value 3', 'value 7'])}
                    style={{ marginRight: '0.5rem' }}
                >
                    Set to 1, 3, 7
                </button>
                <button 
                    type="button"
                    onClick={() => setSelectedValues([])}
                    style={{ marginRight: '0.5rem' }}
                >
                    Clear All
                </button>
                <button 
                    type="button"
                    onClick={() => setSelectedValues(['value 2', 'value 5', 'value 8', 'value 10'])}
                >
                    Set to 2, 5, 8, 10
                </button>
            </div>
        </div>
    );
};
