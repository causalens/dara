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
import { useCallback, useLayoutEffect, useState } from 'react';

export interface DimensionObject {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
    x: number;
    y: number;
}

export type UseDimensionsHook<T extends HTMLElement> = [(node: T) => void, { [k: string]: number }, T];

/**
 * The useDimensions hook allows for a component to track the dimensions of a given element by passing the returned ref
 * to it.
 *
 * @param liveMeasure whether to recalculate dimensions when the user scrolls or resizes the page.
 */
function useDimensions<T extends HTMLElement>(liveMeasure = true): UseDimensionsHook<T> {
    const [dimensions, setDimensions] = useState({});
    const [node, setNode] = useState<T>(null);

    const ref = useCallback((_node: T) => {
        setNode(_node);
    }, []);

    useLayoutEffect(() => {
        if (node) {
            const measure = (): number =>
                window.requestAnimationFrame(() => setDimensions(node.getBoundingClientRect()));
            measure();

            if (liveMeasure) {
                window.addEventListener('resize', measure);
                window.addEventListener('scroll', measure);

                return () => {
                    window.removeEventListener('resize', measure);
                    window.removeEventListener('scroll', measure);
                };
            }
        }
    }, [liveMeasure, node]);

    return [ref, dimensions, node];
}

export default useDimensions;
