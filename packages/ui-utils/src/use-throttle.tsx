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
import throttle from 'lodash/throttle';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ThrottleOptions {
    leading?: boolean;
    trailing?: boolean;
}

/**
 * Create a throttled version of the callback passed. A hook is required to persist the state of the throttle between
 * renders
 *
 * @param cb the function to throttle
 * @param delay how long between each throttled event
 * @param options whether to throttle on the leading or trailing edge, see lodash throttle docs for context
 */
export function useThrottle(
    cb: (...args: Array<any>) => any,
    delay: number,
    options?: ThrottleOptions
): (...args: Array<any>) => any {
    const cbRef = useRef(cb);
    useEffect(() => {
        cbRef.current = cb;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useCallback(
        throttle((...args: Array<any>) => cbRef.current(...args), delay, options),
        [delay, options]
    );
}

/**
 * A throttled version of useState that allows for state to only be updated every so often. This is useful when setting
 * state that may trigger network requests. Exposes a throttled and immediate version of the setState function for
 * greater control
 *
 * @param initialValue the initial state value
 * @param delay how long between each throttled update
 * @param options whether to throttle on the leading or trailing edge, see lodash throttle docs for context
 */
export function useThrottledState<T>(
    initialValue: T,
    delay: number,
    options: ThrottleOptions = { leading: false, trailing: true }
): [T, (value: T) => void, (value: T) => void] {
    const [value, setValue] = useState(initialValue);
    const throttledSetValue = useThrottle(setValue, delay, options);
    return [value, throttledSetValue, setValue];
}
