import * as React from 'react';

import {
    RequestExtras,
    StyledComponentProps,
    UserData,
    Variable,
    handleAuthErrors,
    injectCss,
    request,
    useComponentStyles,
    useRequestExtras,
    useUser,
    useVariable,
} from '@darajs/core';
import styled, { useTheme } from '@darajs/styled-components';
import { Message, Chat as UiChat, UserData as UiUserData } from '@darajs/ui-components';
import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

interface ChatProps extends StyledComponentProps {
    /** Passthrough the className property */
    className: string;
    /** The value Variable to display and update */
    value?: Variable<Message[]>;
}

interface MessageNotificationPayload {
    app_url: string;
    users: UiUserData[];
    content: Message;
}

const ChatWrapper = styled.div`
    pointer-events: auto;

    position: fixed;
    z-index: 999;
    right: 1rem;
    bottom: -0.1rem;
`;

const ChatButton = styled.button`
    width: 3.5rem;
    height: 3.5rem;
    margin: 0 2rem 2rem 0;
    padding-top: 0.5rem;

    color: ${(props) => props.theme.colors.background};

    background-color: ${(props) => props.theme.colors.primary};
    border: none;
    border-radius: 3rem;

    :hover {
        background-color: ${(props) => props.theme.colors.primaryHover};
    }

    :active {
        background-color: ${(props) => props.theme.colors.primaryDown};
    }
`;

const StyledChat = injectCss(UiChat);

/**
 * Parse the user data into the UI user data format
 *
 * @param user the user data to parse
 */
function parseUserData(user: UserData): UiUserData {
    return {
        id: user?.identity_id,
        name: user.identity_name,
        email: user?.identity_email,
    };
}

/**
 * Get all the users which have been active in the chat
 *
 * @param chat the chat to get users from
 */
function getAllUsersInChat(chat: Message[]): UiUserData[] {
    const userMap = new Map<string, UiUserData>();

    chat.forEach((message) => {
        const { email } = message.user;
        // we get the users by email, since this list will be used to send users notifications later on about activity in chat, and this is the most relevant way of identifying them
        if (email && !userMap.has(email)) {
            userMap.set(email, message.user);
        }
    });

    // Return only the unique users who have an email
    return Array.from(userMap.values());
}

/** User data for an unknown user */
const anonymousUser: UserData = { identity_name: 'Anonymous' };

/**
 * Api call to send the new message payload
 */
async function sendNewMessage(payload: MessageNotificationPayload, extras: RequestExtras): Promise<void> {
    try {
        const res = await request(
            '/api/chat/messages',
            {
                body: JSON.stringify(payload),
                method: HTTP_METHOD.POST,
            },
            extras
        );
        await handleAuthErrors(res, true);
        await validateResponse(res, 'Failed to send message notification');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to send message notification:', error);
    }
}

/**
 * The Chat component switches between a chat button and a chat sidebar, allowing the user to interact with a chat.
 *
 * @param props the component props
 */
function Chat(props: ChatProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(props.value);
    const [showChat, setShowChat] = React.useState(false);
    const user = useUser();
    const theme = useTheme();
    const extras = useRequestExtras();
    const userData = user.data ?? anonymousUser;

    const onUpdate = (newValue: Message[]): void => {
        // If the new value is longer than the old value, we can assume that a new message was added
        if (newValue?.length > value?.length) {
            const newMessage = newValue[newValue.length - 1];
            const users = getAllUsersInChat(newValue);
            const notificationPayload: MessageNotificationPayload = {
                app_url: window.location.href,
                users,
                content: newMessage,
            };
            sendNewMessage(notificationPayload, extras);
        }
        setValue(newValue);
    };

    return (
        <ChatWrapper>
            {showChat && (
                <StyledChat
                    $rawCss={css}
                    className={props.className}
                    onClose={() => setShowChat(false)}
                    onUpdate={onUpdate}
                    style={style}
                    value={value}
                    activeUser={parseUserData(userData)}
                />
            )}
            {!showChat && (
                <ChatButton onClick={() => setShowChat(true)}>
                    <svg fill="none" height="32" viewBox="0 0 32 32" width="32" xmlns="http://www.w3.org/2000/svg">
                        <rect fill="none" height="24" rx="3" width="30" x="1" y="1.33594" />
                        <rect
                            height="24"
                            rx="3"
                            stroke={theme.colors.background}
                            strokeWidth="2"
                            width="30"
                            x="1"
                            y="1.33594"
                        />
                        <path
                            d="M8 8.33594H24"
                            stroke={theme.colors.background}
                            strokeLinecap="round"
                            strokeWidth="2"
                        />
                        <path
                            d="M8 13.3359H24"
                            stroke={theme.colors.background}
                            strokeLinecap="round"
                            strokeWidth="2"
                        />
                        <path
                            d="M8 18.3359H24"
                            stroke={theme.colors.background}
                            strokeLinecap="round"
                            strokeWidth="2"
                        />
                        <path
                            d="M18.5981 26.1641L16 30.6641L13.4019 26.1641L18.5981 26.1641Z"
                            fill={theme.colors.background}
                            stroke={theme.colors.background}
                        />
                        <path d="M16 28.3359L13.4019 23.8359L18.5981 23.8359L16 28.3359Z" fill="none" />
                    </svg>
                </ChatButton>
            )}
        </ChatWrapper>
    );
}

export default Chat;
