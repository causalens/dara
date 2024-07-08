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
import { useState } from 'react';

import { ConfirmationModalProps } from './confirmation-modal-props';

interface ConfirmationModalHook<T> {
    /** The props for the modal component, should be spread onto it */
    modalProps: ConfirmationModalProps;
    /** A handler to manually trigger deletion for an element */
    onConfirmation: (item: T) => void | Promise<void>;
}

/**
 * The logic part of the ConfirmationModal system that handles showing/hiding the modal and tracking the item to be deleted,
 * should be used in conjunction with the CCModal component.
 *
 * @param getMessage a function the should return the message to display based off the item passed
 * @param confirm a function that will be called with the item upon confirmation
 */
function useConfirmationModal<T>(
    getMessage: (item: T) => string,
    confirm: (item: T) => void | Promise<void>
): ConfirmationModalHook<T> {
    const [render, setRender] = useState(false);
    const [canceledItem, setCanceledItem] = useState<T>();
    const [message, setMessage] = useState('');

    const onConfirmation = (item: T): void => {
        setMessage(getMessage(item));
        setRender(true);
        setCanceledItem(item);
    };

    const onCancel = (): void => {
        setRender(false);
    };

    const onConfirm = (): void => {
        setRender(false);
        if (confirm) {
            confirm(canceledItem);
        }
    };

    return {
        modalProps: {
            message,
            onCancel,
            onConfirm,
            render,
        },
        onConfirmation,
    };
}

export default useConfirmationModal;
