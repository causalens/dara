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
import { CurriedFunction2 } from 'lodash';
import curry from 'lodash/curry';
import React, { useContext } from 'react';

import { Status } from '@darajs/ui-utils';

import { NotificationPayload } from './notification-payload';
import { NotificationContext } from './notification-wrapper';

interface AnyError extends Error {
    status?: string;
}

export interface UseNotificationsInterface {
    pushErrorNotification: CurriedFunction2<string, Error, void>;
    pushNotification: (notification: NotificationPayload) => void;
    pushWarningNotification: CurriedFunction2<string, Error, void>;
}

/**
 * A helper hook that exposes some helpful methods for defining notifications quickly based of error messages. The error
 * and warning functions are both curried so they can easily be dropped into error handling call backs with only the
 * title defined
 */
export function useNotifications(): UseNotificationsInterface {
    const { push } = useContext(NotificationContext);

    const curriedPush = React.useCallback(
        (status: Status) =>
            curry((title: string, err: AnyError): void => {
                const message = err?.status ? `${err.status}: ${err.message}` : err.message;
                push({
                    key: title,
                    message,
                    status,
                    title: `${status.toUpperCase()}: ${title}`,
                });
            }),
        [push]
    );

    const pushErrorNotification = React.useMemo(() => curriedPush(Status.ERROR), [curriedPush]);
    const pushWarningNotification = React.useMemo(() => curriedPush(Status.WARNING), [curriedPush]);

    return {
        pushErrorNotification,
        pushNotification: push,
        pushWarningNotification,
    };
}
