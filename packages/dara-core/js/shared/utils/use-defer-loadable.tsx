import { useContext, useEffect, useRef, useState } from 'react';
import { Loadable } from 'recoil';

import { FallbackCtx } from '@/shared/context';

/**
 * A hook that allows you to defer the loading of a loadable depending on the suspend setting in FallbackCtx.
 *
 * @param loadable The loadable to defer
 */
export default function useDeferLoadable<T>(loadable: Loadable<T>): T {
    const { suspend } = useContext(FallbackCtx);
    // Suspend on first render with getValue()
    const [availableState, setAvailableState] = useState(() => loadable.getValue());

    const timerId = useRef<NodeJS.Timeout>(null);
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
            clearTimeout(timerId.current);
        };
    }, [loadable.state, suspend]);

    useEffect(() => {
        if (loadable.state === 'hasValue') {
            clearTimeout(timerId.current);
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
