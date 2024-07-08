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
import { useCallback, useContext, useEffect, useState } from 'react';
import * as React from 'react';
import { Subject } from 'rxjs';
import { delay } from 'rxjs/operators';

import styled from '@darajs/styled-components';
import { useSubscription } from '@darajs/ui-utils';

import Notification from './notification';
import { NotificationPayload } from './notification-payload';

const Container = styled.div`
    pointer-events: none;

    position: fixed;
    z-index: 6000;
    right: 1rem;

    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
    justify-content: flex-end;

    width: 324px;
    height: 100%;
    padding: 0.75rem 0;
`;

interface NotificationContext {
    notifications$: Subject<NotificationPayload>;
    onMoreDetailsClick?: (notification: NotificationPayload) => void;
    push: (notification: NotificationPayload) => void;
}

const baseNotifications$ = new Subject<NotificationPayload>();

/**
 * The main notification context, it exposes a stream of notifications to anything wanting to consume them as well as a
 * generic push method for sending a new one
 * Additionally, it exposes a callback for when the notification is too small and more details are needed and clicked
 */
export const NotificationContext = React.createContext({
    notifications$: baseNotifications$,
    onMoreDetailsClick: null,
    push: (notification: NotificationPayload) => baseNotifications$.next(notification),
});

const EXPIRY = 9900; // Set to just below 10s so notifications close before polling occurs

interface NotificationWrapperProps {
    /** Optional, pass through of the native style property */
    style?: React.CSSProperties;
}

/**
 * The notification wrapper adds an invisible container to the right hand side of the application that feeds
 * notifications in from the bottom by subscribing to the notifications$ stream on context
 *
 * @param props the component props
 */
function NotificationWrapper(props: NotificationWrapperProps): JSX.Element {
    const [notifications, setNotifications] = useState<Array<NotificationPayload>>([]);
    const wrapSub = useSubscription();
    const { notifications$, onMoreDetailsClick } = useContext(NotificationContext);

    // Subscribe to the notifications stream and add them to the list of notifications to render
    useEffect(() => {
        if (notifications$) {
            wrapSub(
                notifications$.subscribe({
                    next: (notification) => {
                        setNotifications((prev) => [...prev.filter((n) => n.key !== notification.key), notification]);
                    },
                })
            );
        }
    }, [notifications$, wrapSub]);

    // Subscribe to the notifications stream delayed by 10s and remove notifications from the list
    useEffect(() => {
        wrapSub(
            notifications$.pipe(delay(EXPIRY)).subscribe({
                next: (notification) => {
                    setNotifications((prev) => prev.filter(({ key }) => notification.key !== key));
                },
            })
        );
    }, [notifications$, wrapSub]);

    const onDismiss = useCallback((key: string) => {
        setNotifications((prev) => prev.filter((notification) => notification.key !== key));
    }, []);

    return (
        <Container style={props.style}>
            {notifications.map((notification) => (
                <Notification
                    key={notification.key}
                    notification={notification}
                    onDismiss={onDismiss}
                    onMoreDetailsClick={onMoreDetailsClick}
                />
            ))}
        </Container>
    );
}

export default NotificationWrapper;
