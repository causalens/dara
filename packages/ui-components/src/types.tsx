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
export type JSONData = { [k: string]: string | number | boolean | JSONData | Array<JSONData> };

export interface ItemBadge {
    color?: string;
    label: string;
}

/** Standard interface for dropdown items */
export interface Item {
    badge?: ItemBadge;
    image?: string;
    label: string;
    onClick?: () => void | Promise<void>;
    value: any;
}

export interface CarouselItem {
    component?: React.ReactNode;
    image?: string;
    imageAlt?: string;
    imageHeight?: string;
    imageWidth?: string;
    subtitle?: string;
    title?: string;
}

export interface AccordionItemType {
    badge?: ItemBadge;
    content: any;
    label: string;
}

export interface ComponentSelectItem {
    component: React.ReactNode;
    subtitle?: string;
    title: string;
}

export interface InteractiveComponentProps<T> {
    /** Pass through of className property */
    className?: string;
    /** Optional property to disable the button */
    disabled?: boolean;
    /** An error message for the component, if it is an empty string then the element is valid. */
    errorMsg?: string;
    /** The initial value of the element */
    initialValue?: T;
    /** Native react style property, can be used to fine tune the element appearance */
    style?: React.CSSProperties;
    /** An optional value field to put the component into controlled mode */
    value?: T;
}

/** Type for a Chat message */
export interface Message {
    /** Unique identifier for the message */
    id: string;
    /** The message content */
    message: string;
    /** The timestamp of the creation of the message */
    created_at: string;
    /** The timestamp of the last time the message was edited */
    updated_at: string;
    /** User data of the person who wrote the message */
    user: UserData;
}

export interface UserData {
    id?: string;
    name: string;
    email?: string;
}
