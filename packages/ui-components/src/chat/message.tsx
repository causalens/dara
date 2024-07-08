/**
 * Copyright 2024 Impulse Innovations Limited
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
import { format, parseISO } from 'date-fns';
import { isEqual } from 'lodash';
import * as React from 'react';

import styled, { useTheme } from '@darajs/styled-components';
import { PenToSquare, Trash } from '@darajs/ui-icons';

import Button from '../button/button';
import Markdown from '../markdown/markdown';
import TextArea from '../textarea/textarea';
import Tooltip from '../tooltip/tooltip';
import { InteractiveComponentProps, Message } from '../types';

const InteractiveIcons = styled.div`
    position: absolute;
    top: 0.75rem;
    left: 236px;

    display: none;
    gap: 0.5rem;

    padding: 0.3rem;

    background-color: ${(props) => props.theme.colors.blue1};
    border-radius: 0.25rem;
    box-shadow: ${(props) => props.theme.shadow.medium};
`;

const MessageWrapper = styled.div`
    position: relative;

    gap: 0.5rem;

    width: 100%;
    padding: 1rem;

    background-color: ${(props) => props.theme.colors.blue1};
    border-radius: 0.25rem;
    box-shadow: ${(props) => props.theme.shadow.medium};

    :hover ${InteractiveIcons} {
        display: flex;
    }
`;

const MessageTop = styled.div`
    display: flex;
    justify-content: space-between;
    width: 100%;
    font-size: 0.875rem;
`;

const MessageTimestamp = styled.span`
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors.grey5};
`;

const MessageBody = styled.span`
    width: 100%;
    color: ${(props) => props.theme.colors.text};
    overflow-wrap: break-word;
`;

const EditedText = styled.span`
    align-self: end;
    font-size: 0.8rem;
    color: ${(props) => props.theme.colors.grey4};
`;

const DeleteIcon = styled(Trash)`
    height: 0.8rem;
    color: ${(props) => props.theme.colors.secondary};

    :hover {
        color: ${(props) => props.theme.colors.secondaryHover}CC;
    }

    :active {
        color: ${(props) => props.theme.colors.secondaryDown}99;
    }
`;

const EditIcon = styled(PenToSquare)`
    height: 0.8rem;
    color: ${(props) => props.theme.colors.secondary};

    :hover {
        color: ${(props) => props.theme.colors.secondaryHover}CC;
    }

    :active {
        color: ${(props) => props.theme.colors.secondaryDown}99;
    }
`;

const EditButtons = styled.div`
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
`;

const UserInfoWrapper = styled.div`
    display: flex;
    gap: 0.5rem;
    align-items: center;
`;

const AvatarIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 2rem;
    height: 2rem;

    font-weight: 700;
    color: white;

    border-radius: 50%;
`;

export interface MessageProps extends InteractiveComponentProps<Message> {
    /** An optional onChange handler for listening to changes in the input */
    onChange?: (value: Message, e?: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional event listener for complete events (enter presses) */
    onDelete?: (id: string) => void | Promise<void>;
    /** An optional flag to determine if the message is editable */
    isEditable?: boolean;
}

/**
 * A function to get the formatted timestamp to display in the submitted message
 */
export function getFormattedTimestamp(date: string): string {
    return format(parseISO(date), 'HH:mm dd/MM/yyyy');
}

/**
 * A function to assign a color to user token depending on their name
 */
function selectColor(name: string, colors: string[]): string {
    // Convert the name to lowercase for consistency
    const lowerCaseName = name.toLowerCase();

    // Calculate the sum of ASCII values of the characters in the name
    let asciiSum = 0;
    for (const char of lowerCaseName) {
        asciiSum += char.charCodeAt(0);
    }

    // Use the remainder to select a color
    const colorIndex = asciiSum % colors.length;
    return colors[colorIndex];
}

/**
 * A function to get the user's initials
 */
function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    let initials = parts[0][0];

    // If there's a second part, add its first character, so we only get two letter initials
    if (parts.length > 1) {
        initials += parts[parts.length - 1][0];
    }

    return initials.toUpperCase();
}

/**
 * A function to porcess the text for the markdown render
 */
export function processText(text: string): string {
    return text.replace(/\n/g, '\n\n');
}

/**
 * A Message component that displays a message with a timestamp and allows for editing and deleting
 *
 * @param {MessageProps} props - the component props
 */
function MessageComponent(props: MessageProps): JSX.Element {
    const theme = useTheme();
    const [editMode, setEditMode] = React.useState(false);
    const [editMessage, setEditMessage] = React.useState(props.value.message);
    const [localMessage, setLocalMessage] = React.useState(props.value);
    if (props.value && !isEqual(props.value, localMessage)) {
        setLocalMessage(props.value);
    }

    // List of colors for user token to pick from
    const tokenColors = [
        theme.colors.secondary,
        theme.colors.violet,
        theme.colors.turquoise,
        theme.colors.purple,
        theme.colors.teal,
        theme.colors.orange,
        theme.colors.plum,
    ];

    const onAccept = (): void => {
        // if the message hasn't changed, just close the edit mode
        if (editMessage === localMessage.message) {
            setEditMode(false);
            return;
        }
        // remove any /n and trailing whitespace
        const newMessage = {
            ...localMessage,
            message: editMessage.trim(),
            updated_at: new Date().toISOString(),
        };

        props?.onChange(newMessage);
        setLocalMessage(newMessage);
        // reset the textarea message to the message without the /n and trailing whitespace
        setEditMessage(newMessage.message);
        setEditMode(false);
    };

    const onDelete = (): void => {
        if (props.onDelete) {
            props.onDelete(props.value.id);
        }
    };

    return (
        <MessageWrapper className={props.className} style={props.style}>
            <MessageTop>
                <UserInfoWrapper>
                    <AvatarIcon style={{ backgroundColor: selectColor(localMessage.user.name, tokenColors) }}>
                        {getInitials(localMessage.user.name)}
                    </AvatarIcon>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {localMessage.user.name}
                        <MessageTimestamp>{getFormattedTimestamp(props.value.created_at)}</MessageTimestamp>
                    </div>
                    {localMessage.updated_at !== localMessage.created_at && (
                        <Tooltip content={getFormattedTimestamp(props.value.updated_at)}>
                            <EditedText> (edited)</EditedText>
                        </Tooltip>
                    )}
                </UserInfoWrapper>
                {!editMode && props.isEditable && (
                    <InteractiveIcons>
                        <EditIcon data-testid="message-edit-button" onClick={() => setEditMode(true)} role="button" />
                        <DeleteIcon data-testid="message-delete-button" onClick={onDelete} role="button" />
                    </InteractiveIcons>
                )}
            </MessageTop>
            {editMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <TextArea onChange={setEditMessage} resize="vertical" value={editMessage} />
                    <EditButtons>
                        <Button onClick={() => setEditMode(false)} outline>
                            Cancel
                        </Button>
                        <Button onClick={onAccept}>Save</Button>
                    </EditButtons>
                </div>
            )}
            {!editMode && (
                <MessageBody>
                    <Markdown markdown={processText(localMessage.message)} />
                </MessageBody>
            )}
        </MessageWrapper>
    );
}

export default MessageComponent;
