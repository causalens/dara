import { useEffect, useRef, useState } from 'react';
import { type Loadable } from 'recoil';

import { useFallbackCtx } from '../context/fallback-context';

/**
 * A hook that allows you to defer the loading of a loadable depending on the suspend setting in FallbackCtx.
 *
 * @param loadable The loadable to defer
 */
export default function useDeferLoadable<T>(loadable: Loadable<T>): T {
    const { suspend } = useFallbackCtx();
    // Suspend on first render with getValue()
    const [availableState, setAvailableState] = useState(() => loadable.getValue());

    const timerId = useRef<NodeJS.Timeout | null>(null);
    const isFirstRender = useRef(true);
    const [showFallback, setShowFallback] = useState(false);

    useEffect(() => {
        // Skip the first render, as we're suspending anyway
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        // when the selector becomes loading, set a timeout if suspend is a number to switch to suspend mode
        if (loadable.state === 'loading' && typeof suspend === 'number') {
            timerId.current = setTimeout(() => {
                setShowFallback(true);
            }, suspend);
        }

        return () => {
            if (timerId.current) {
                clearTimeout(timerId.current);
            }
        };
    }, [loadable.state, suspend]);

    useEffect(() => {
        if (loadable.state === 'hasValue') {
            if (timerId.current) {
                clearTimeout(timerId.current);
            }
            setShowFallback(false);
            setAvailableState(loadable.valueOrThrow());
        }
    }, [loadable]);

    // Suspend
    if (suspend === true || showFallback) {
        return loadable.getValue();
    }

    return availableState;
}
