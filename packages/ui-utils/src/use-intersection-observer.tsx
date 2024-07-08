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
import { MutableRefObject, useEffect, useState } from 'react';

/**
 * The useIntersectionObserver hook allows a component to track whether an element is intersecting with an ancestor
 * element or with a top-level document's viewport.
 *
 * @param ref the ref to the element that is to be observed
 * @param rootMargin the amount of the element that is to be intersecting for the observer's callback to be executed.
 * @param threshold Either a single number or an array of numbers which indicate at what percentage of the target's
 * visibility the observer's callback should be executed.
 * @returns boolean indicating whether element is intersecting or not
 */

function useIntersectionObserver<T extends Element>(
    ref: MutableRefObject<T>,
    rootMargin = '0px',
    threshold = 1.0
): boolean {
    const [isIntersecting, setIntersecting] = useState<boolean>(false);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), {
            rootMargin,
            threshold,
        });
        if (ref.current) {
            observer.observe(ref.current);
        }

        const currentRef = ref.current;

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            } else {
                observer.disconnect();
            }
        };
    }, [ref, rootMargin, threshold]);
    return isIntersecting;
}

export default useIntersectionObserver;
