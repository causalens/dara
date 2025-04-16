import * as React from 'react';

/**
 * Helper hook that accepts a callback and returns a stable reference to it.
 * Can be used to wrap a callback that is passed as a prop to a child component when used
 * within an effect or memo to prevent unnecessary re-renders.
 *
 * @param callback - the callback to stabilize
 * @returns - a stable reference to the callback
 */
export const useLatestCallback = <Args extends ReadonlyArray<unknown>, Return>(
    callback: (...args: Args) => Return
): ((...args: Args) => Return) => {
    const cbRef = React.useRef(callback);

    React.useLayoutEffect(() => {
        cbRef.current = callback;
    }, [callback]);

    const stableCallback = React.useCallback(
        (...args: Args): Return => {
            return cbRef.current(...args);
        },
        [cbRef]
    );

    return stableCallback;
};

