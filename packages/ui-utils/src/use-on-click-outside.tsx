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
import { useEffect } from 'react';

/**
 * The useOnClickOutside hook allows for a component to track whether a click was made outside an element
 *
 * @param element any element that the hook should handle the click outside of
 * @param handler callback for when a click outside of the given element occurs
 */

function useOnClickOutside(element: HTMLElement, handler: () => void): void {
    useEffect(() => {
        const listener = (event: MouseEvent): void => {
            // Do nothing if clicking ref's element or descendent elements
            if (!element || element.contains(event.target as Node)) {
                return;
            }
            handler();
        };
        document.addEventListener('mousedown', listener);
        document.addEventListener('touchstart', listener);
        return () => {
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [element, handler]);
}

export default useOnClickOutside;
