import { useEffect, useRef } from 'react';

/**
 * A helper hook to keep track of the previous value of a variable.
 * Uses a `ref` underneath so does not cause additional re-renders.
 *
 * @param value value to keep track of
 * @param initialValue initial value
 */
function usePrevious<T>(value: T, initialValue: T): T {
    const ref = useRef(initialValue);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

export default usePrevious;
