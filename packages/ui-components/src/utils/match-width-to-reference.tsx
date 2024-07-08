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
import { type ElementRects, type Elements, Middleware, size } from '@floating-ui/react';

/**
 * A middleware for Floating UI that auto sizes the floating content to be the same as the reference element.
 * Optionally, a delta can be added to the width.
 */
const matchWidthToReference = (delta = 0): Middleware =>
    size({
        apply({ rects, elements }: { rects: ElementRects; elements: Elements }) {
            Object.assign(elements.floating.style, {
                width: `${rects.reference.width + delta}px`,
            });
        },
    });

export default matchWidthToReference;
