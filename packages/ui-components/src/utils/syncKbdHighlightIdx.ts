import { useCombobox, useSelect } from 'downshift';

const { stateChangeTypes: useSelectChangeTypes } = useSelect;
const { stateChangeTypes: useComboboxChangeTypes } = useCombobox;

const setTypes = new Set([
    useSelectChangeTypes.ToggleButtonKeyDownArrowDown,
    useSelectChangeTypes.ToggleButtonKeyDownArrowUp,
    useComboboxChangeTypes.InputKeyDownArrowDown,
    useComboboxChangeTypes.InputKeyDownArrowUp,
]);

/**
 * Synchronizes the highlighted index with keyboard navigation and resets it for mouse movements.
 *
 * This function returns an object with an `onHighlightedIndexChange` method that handles changes to the highlighted index.
 * It updates the `setKbdHighlightIdx` callback to force a rerender when the element is highlighted using the keyboard,
 * and resets the index when the mouse is used to let CSS :hover take over the styling.
 *
 * @param {function} setKbdHighlightIdx - Callback function to set the highlighted index for keyboard navigation.
 * @returns {object} An object containing the `onHighlightedIndexChange` method.
 *
 * @example
 * const { onHighlightedIndexChange } = syncKbdHighlightIdx(setKbdHighlightIdx);
 *
 * // Use this method in the Downshift hook to handle highlighted index changes
 * useSelect({
 *   items,
 *   onHighlightedIndexChange
 * });
 */
export const syncKbdHighlightIdx = (
    setKbdHighlightIdx: (idx: number) => void
): { onHighlightedIndexChange: ({ highlightedIndex, type }: any) => void } => ({
    onHighlightedIndexChange: ({ highlightedIndex, type }: any) => {
        // Hack to force a rerender of an element when highlighted with a keyboard
        if (setTypes.has(type)) {
            setKbdHighlightIdx(highlightedIndex);
        }
        // Reset the highlighted index to let CSS :hover take over the styling
        if (type === useSelectChangeTypes.ItemMouseMove) {
            setKbdHighlightIdx(undefined);
        }
    },
});
