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
export enum Key {
    BACKSPACE = 'Backspace',
    CTRL = 'Control',
    DOWN = 'ArrowDown',
    ENTER = 'Enter',
    ESCAPE = 'Escape',
    LEFT = 'ArrowLeft',
    META = 'Meta',
    MINUS = '-',
    PERIOD = '.',
    RIGHT = 'ArrowRight',
    SHIFT = 'Shift',
    TAB = 'Tab',
    UP = 'ArrowUp',
}

// A list of keys for the common controls / modifiers
export const CONTROL_KEYS: string[] = [
    Key.ESCAPE,
    Key.TAB,
    Key.ENTER,
    Key.BACKSPACE,
    Key.CTRL,
    Key.SHIFT,
    Key.UP,
    Key.DOWN,
    Key.LEFT,
    Key.RIGHT,
    Key.META,
];
