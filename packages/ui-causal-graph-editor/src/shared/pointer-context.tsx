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
import { createContext } from 'react';

interface PointerContext {
    /**
     * Whether to disable pointer events on the panels
     */
    disablePointerEvents: boolean;
    /**
     * Handler for when a panel is hovered over
     */
    onPanelEnter: () => void;
    /**
     * Handler for when a panel is no longer hovered over
     */
    onPanelExit: () => void;
}

/**
 * Context for handling interactions between the editor overlay and the editor canvas
 */
const pointerCtx = createContext<PointerContext>(null);

export default pointerCtx;
