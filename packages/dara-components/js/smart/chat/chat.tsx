import * as React from 'react';

import { StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';
import { Message, Chat as UiChat } from '@darajs/ui-components';

interface ChatProps extends StyledComponentProps {
    /** Passthrough the className property */
    className: string;
    /** The value Variable to display and update */
    value?: Variable<Message[]>;
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
 * The Chat component switches between a chat button and a chat sidebar, allowing the user to interact with a chat.
 *
 * @param props the component props
 */
function Chat(props: ChatProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(props.value);
    const [showChat, setShowChat] = React.useState(false);

    const DeleteMessage = (messageId: string): void => {
        const newMessages = value.filter((message) => message.id !== messageId);
        setValue(newMessages);
    };

    return (
        <ChatWrapper>
            {showChat && (
                <StyledChat
                    $rawCss={css}
                    className={props.className}
                    onAdd={setValue}
                    onClose={() => setShowChat(false)}
                    onDelete={DeleteMessage}
                    onEdit={setValue}
                    style={style}
                    value={value}
                />
            )}
            {!showChat && (
                <ChatButton onClick={() => setShowChat(true)}>
                    <svg fill="none" height="32" viewBox="0 0 32 32" width="32" xmlns="http://www.w3.org/2000/svg">
                        <rect fill="none" height="24" rx="3" width="30" x="1" y="1.33594" />
                        <rect height="24" rx="3" stroke="#FBFCFF" strokeWidth="2" width="30" x="1" y="1.33594" />
                        <path d="M8 8.33594H24" stroke="#FBFCFF" strokeLinecap="round" strokeWidth="2" />
                        <path d="M8 13.3359H24" stroke="#FBFCFF" strokeLinecap="round" strokeWidth="2" />
                        <path d="M8 18.3359H24" stroke="#FBFCFF" strokeLinecap="round" strokeWidth="2" />
                        <path
                            d="M18.5981 26.1641L16 30.6641L13.4019 26.1641L18.5981 26.1641Z"
                            fill="#FBFCFF"
                            stroke="#FBFCFF"
                        />
                        <path d="M16 28.3359L13.4019 23.8359L18.5981 23.8359L16 28.3359Z" fill="none" />
                    </svg>
                </ChatButton>
            )}
        </ChatWrapper>
    );
}

export default Chat;
