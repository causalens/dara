import { mapValues } from 'lodash';
import React from 'react';
import { tinykeys } from 'tinykeys';
import type { KeyBindingMap, KeyBindingOptions } from 'tinykeys';

/**
 * Mutually exclusive options for the useTinyKeys hook. `focusRef` takes precedence over `allowInputs`.
 */
type Options = {
    /**
     * If true, will allow shortcuts to be executed when the focus is on a text input, textarea, select, or contenteditable element. Defaults to `false`.
     * Mutually exclusive with `focusRef`.
     */
    allowInputs?: boolean;

    /**
     * If specified, only allow shortcuts to be executed when the focus is on the specified element or its children.
     * Mutually exclusive with `allowInputs`.
     */
    focusRef?: React.RefObject<HTMLElement>;

    /**
     * Middlewares are functions that can additionally filter out shortcuts by returning `true` or `false`.
     * If any middleware returns `false`, the shortcut will not be executed.
     */
    middlewares?: (() => boolean)[];
};

/**
 * Custom hook that allows you to easily bind keyboard shortcuts using tinykeys.
 *
 * @param {KeyBindingMap} keyBindingMap - An object that maps key combinations to callback functions.
 * @param {KeyBindingOptions & Options} options - Additional options for configuring the behavior of the hook.
 *
 * @example
 * // Global document hotkeys, excluding text inputs:
 * useTinykeys({
 *    'Enter': (e) => { e.preventDefault(); console.info('Enter pressed'); },
 * });
 *
 * @example
 * // Global document hotkeys, including text inputs:
 * useTinykeys({
 *    'Enter': (e) => { e.preventDefault(); console.info('Enter pressed'); },
 * }, { allowInputs: true });
 */

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export const useTinykeys = (keyBindingMap: KeyBindingMap, options: KeyBindingOptions & Options = {}): void => {
    React.useEffect(() => {
        const allowOnlyNonInputElements = (): boolean => {
            const element = document.activeElement;
            const ignoreElements = ['INPUT', 'TEXTAREA', 'SELECT', 'CONTENTEDITABLE'];

            if (
                element instanceof HTMLElement &&
                (ignoreElements.includes(element.tagName) || element.isContentEditable)
            ) {
                // The focus is on a text input, textarea, select, or contenteditable element
                return false; // Do not execute shortcut
            }
            return true;
        };

        const getKeyEventFilter = (): (() => boolean) => {
            if (!options.allowInputs) {
                return allowOnlyNonInputElements;
            }
            return () => true; // Always allow if no specific filter is applied
        };

        const keyEventFilter = getKeyEventFilter();

        const wrappedKeyBindingMap = mapValues(keyBindingMap, (callback) => (e: KeyboardEvent) => {
            if (options.middlewares && !options.middlewares.every((middleware) => middleware())) {
                return;
            }
            if (keyEventFilter()) {
                /*
                This hook is often used to apply listeners to both a specific element and the entire window,
                this prevents the same event from being processed multiple times since otherwise an element-specific
                event could bubble up to the window and be processed again.
                */
                e.stopPropagation();
                e.preventDefault();
                callback(e);
            }
        });

        const unsub = tinykeys(options.focusRef?.current ?? window, wrappedKeyBindingMap, options);
        return () => unsub();
    }, [keyBindingMap, options]);
};

/**
 * Binds keyboard shortcuts to a specific element and its children's focus using the `useTinykeys` hook.
 *
 * @param keyBindingMap - The map of key bindings and their corresponding handlers.
 * @param ref - The reference to the element to be focused.
 *
 * @example
 * // Hotkeys for a specific element and its children:
 * const ref = React.useRef(null);
 * useFocusTinykeys({
 *    'Enter': (e) => { e.preventDefault(); console.info('Enter pressed'); },
 * }, ref);
 * return <div ref={ref}>...</div>;
 */
export const useFocusTinykeys = (
    keyBindingMap: KeyBindingMap,
    ref: React.RefObject<HTMLElement>,
    options?: Options
): void => {
    return useTinykeys(keyBindingMap, { ...options, focusRef: ref });
};
