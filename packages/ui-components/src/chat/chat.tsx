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
import { isEqual } from 'lodash';
import { nanoid } from 'nanoid';
import * as React from 'react';

import styled from '@darajs/styled-components';
import { PaperPlane, Xmark } from '@darajs/ui-icons';

import Button from '../button/button';
import TextArea from '../textarea/textarea';
import { InteractiveComponentProps, Message, UserData } from '../types';
import { default as MessageComponent } from './message';

const ChatWrapper = styled.div<{ $isPopup: boolean }>`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    width: ${(props) => (props.$isPopup ? '350px' : '100%')};
    height: ${(props) => (props.$isPopup ? 'calc(100vh - 2rem)' : '100%')};
    padding: 1.5rem;

    background-color: ${(props) => (props.$isPopup ? `${props.theme.colors.background}e6` : 'inherit')};
    border-radius: ${(props) => (props.$isPopup ? '0.4rem' : 0)};
    box-shadow: ${(props) => props.theme.shadow.medium};
`;

const ReplyWrapper = styled.div`
    display: flex;
    gap: 0.5rem;
    align-items: end;
    margin-top: auto;
`;

const ReplyButtons = styled.div`
    display: flex;
    gap: 1rem;
    align-items: end;
`;

const ChatBody = styled.div`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    max-height: calc(100% - 6.225rem);
    margin: -0.25rem;
    padding: 0.25rem;
`;

const ChatTop = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    height: 1.625rem;

    font-size: 1.2rem;
`;

const CloseIcon = styled(Xmark)`
    height: 1.2rem;
    color: ${(props) => props.theme.colors.grey4};

    :hover {
        color: ${(props) => props.theme.colors.grey5};
    }

    :active {
        color: ${(props) => props.theme.colors.grey6};
    }
`;

export interface ChatProps extends InteractiveComponentProps<Message[]> {
    /** Event triggered when the chat sidebar is closed */
    onClose?: () => void | Promise<void>;
    /** Event triggered when the chat is changed */
    onUpdate?: (value: Message[]) => void | Promise<void>;
    /** The user who is currently active in the chat */
    activeUser: UserData;
    /** The title to appear at the top of the chat */
    chatTitle?: string;
    /** The placeholder text for the reply field */
    placeholder?: string;
    /** Whether the chat is in a popup and should be styled as such */
    isPopup?: boolean;
    /** A component showing the loading state of the chat, it appears above the input area, when not loading the caller can set it to null */
    loadingComponent?: React.ReactNode;
    /** Whether the user can edit/delete previous messages */
    isHistoryReadonly?: boolean;
}

/**
 * A function to scroll to the bottom of the chat so that the latest message is visible
 */
function scrollToBottom(node: HTMLElement | null): void {
    setTimeout(() => {
        if (node) {
            node.scrollTop = node.scrollHeight;
        }
    }, 100);
}

/**
 * A function to check if the user wrote the message
 *
 * @param message - the message to check
 * @param user - the user to check against
 */
function didUserWriteMessage(message: Message, user: UserData): boolean {
    if (user?.id) {
        return message.user?.id === user.id;
    }
    return message.user.name === user.name;
}

/**
 * A chat component
 *
 * @param {ChatProps} props - the component props
 */
function Chat(props: ChatProps): JSX.Element {
    const [reply, setReply] = React.useState('');

    const [localMessages, setLocalMessages] = React.useState(props.value ?? []);

    const chatBodyRef = React.useRef<HTMLDivElement>(null);

    const localMessagesRef = React.useRef<Message[]>(localMessages);
    React.useLayoutEffect(() => {
        localMessagesRef.current = localMessages;
    }, [localMessages]);

    React.useEffect(() => {
        if (!isEqual(props.value, localMessagesRef.current)) {
            setLocalMessages(props.value ?? []);
            scrollToBottom(chatBodyRef?.current);
        }
    }, [props.value]);

    const onChangeReply = (text: string): void => {
        // Prevents the message starting with a newline
        if (!text.startsWith('\n')) {
            setReply(text);
        }
    };

    const onSubmitMessage = (): void => {
        if (reply) {
            // Create a new message
            const timestamp = new Date().toISOString();
            const newMessage = {
                id: nanoid(),
                // remove any /n and trailing whitespace
                message: reply.trim(),
                created_at: timestamp,
                updated_at: timestamp,
                user: props.activeUser,
            };
            const newMessages = [...localMessages, newMessage];

            // Add the new message to the chat
            props.onUpdate?.(newMessages);
            setLocalMessages(newMessages);

            // Clear the reply field and scroll to the bottom of the chat to show latest message
            setReply('');
            scrollToBottom(chatBodyRef?.current);
        }
    };

    const onEditMessage = (message: Message): void => {
        // Find the message to edit and replace it with the new message
        const newMessages = localMessages.map((m) => {
            if (m.id === message.id) {
                return message;
            }
            return m;
        });
        // Update the chat
        props.onUpdate?.(newMessages);
        setLocalMessages(newMessages);
    };

    const onDeleteMessage = (id: string): void => {
        // Remove the message with the given id
        const newMessages = localMessages.filter((message) => message.id !== id);
        // Update the chat
        props.onUpdate?.(newMessages);
        setLocalMessages(newMessages);
    };

    React.useLayoutEffect(() => {
        scrollToBottom(chatBodyRef?.current);
    }, []);

    return (
        <ChatWrapper className={props.className} style={props.style} $isPopup={props.isPopup}>
            <ChatTop>
                <span>{props.chatTitle ?? 'Chat'}</span>
                {props.isPopup && <CloseIcon onClick={props.onClose} aria-label="Close chat" />}
            </ChatTop>
            <ChatBody ref={chatBodyRef} role="log">
                {localMessages.map((message) => (
                    <MessageComponent
                        key={message.id}
                        onChange={onEditMessage}
                        onDelete={onDeleteMessage}
                        value={message}
                        didUserWriteMessage={didUserWriteMessage(message, props.activeUser)}
                        isEditable={!props.isHistoryReadonly}
                    />
                ))}
                {props.loadingComponent}
            </ChatBody>
            <ReplyWrapper>
                <TextArea
                    onChange={onChangeReply}
                    onComplete={onSubmitMessage}
                    placeholder={props.placeholder ?? 'Add a comment'}
                    resize="none"
                    maxHeight={6}
                    value={reply}
                    style={{ width: '100%' }}
                />
                <ReplyButtons>
                    <Button
                        aria-label="Send"
                        style={{ height: '3.4rem' }}
                        disabled={!!props.loadingComponent || !(reply.trim().length > 0)}
                        onClick={onSubmitMessage}
                    >
                        <PaperPlane onClick={onSubmitMessage} />
                    </Button>
                </ReplyButtons>
            </ReplyWrapper>
        </ChatWrapper>
    );
}

export default Chat;
