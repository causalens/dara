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

/* eslint-disable jest/no-disabled-tests */
import { fireEvent, render } from '@testing-library/react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import { Message } from '../types';
import Chat, { ChatProps } from './chat';

function RenderChat(props: ChatProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Chat {...props} />
        </ThemeProvider>
    );
}

const mockUser1 = {
    id: 'user1',
    name: 'User 1',
    email: 'user@email.com',
};

const mockUser2 = {
    name: 'User 2',
};

const mockUser3 = {
    name: 'User 3',
};

const mockMessages: Message[] = [
    {
        id: '1',
        message: 'Hello',
        created_at: '2024-04-03T10:34:17.167Z',
        updated_at: '2024-04-03T10:34:17.167Z',
        user: mockUser1,
    },
    {
        id: '2',
        message: 'Hi',
        created_at: '2024-04-03T10:35:17.167Z',
        updated_at: '2024-04-03T10:35:17.167Z',
        user: mockUser2,
    },
    {
        id: '3',
        message: 'Hey',
        created_at: '2024-04-03T10:36:17.167Z',
        updated_at: '2024-04-03T10:36:17.167Z',
        user: mockUser1,
    },
];

describe('Chat', () => {
    it('should be able to add a message', () => {
        const { getByRole, getByText } = render(<RenderChat activeUser={mockUser1} />);
        const textArea = getByRole('textbox');
        // Write a message in textare
        fireEvent.change(textArea, { target: { value: 'Hello' } });
        expect(textArea).toHaveValue('Hello');

        // Click the send button
        const button = getByRole('button', { name: /send/i });
        fireEvent.click(button);
        expect(textArea).toHaveValue('');

        // Check that the message is added with expected user and content
        expect(getByText('Hello')).toBeInTheDocument();
        expect(getByText('User 1')).toBeInTheDocument();
    });

    it('should be able to add a message with enter', () => {
        const { getByRole, getByText } = render(<RenderChat activeUser={mockUser1} />);
        const textArea = getByRole('textbox');
        // Write a message in textare
        fireEvent.change(textArea, { target: { value: 'Hello' } });
        expect(textArea).toHaveValue('Hello');

        // Press enter
        fireEvent.keyDown(textArea, { key: 'Enter', code: 'Enter' });
        expect(textArea).toHaveValue('');

        // Check that the message is added with expected user and content
        expect(getByText('Hello')).toBeInTheDocument();
        expect(getByText('User 1')).toBeInTheDocument();
    });

    it('onUpdate should be called when submiting a message', () => {
        const onUpdate = jest.fn();
        const { getByRole } = render(<RenderChat activeUser={mockUser1} onUpdate={onUpdate} value={mockMessages} />);

        // Write a new message
        const textArea = getByRole('textbox');
        fireEvent.change(textArea, { target: { value: 'Test' } });
        expect(textArea).toHaveValue('Test');

        // Send message
        const button = getByRole('button', { name: /send/i });
        fireEvent.click(button);

        // Check that onUpdate was called with the new message
        expect(onUpdate).toHaveBeenCalledWith(
            expect.arrayContaining([...mockMessages, expect.objectContaining({ message: 'Test' })])
        );
    });

    it('cancel edited message should not trigger onUpdate', () => {
        const onUpdate = jest.fn();
        const { getByRole, getAllByTestId, getAllByRole, getByDisplayValue } = render(
            <RenderChat activeUser={mockUser1} onUpdate={onUpdate} value={mockMessages} />
        );

        // Check that there is only one textarea which is to add new messages
        expect(getAllByRole('textbox')).toHaveLength(1);

        // Find edit button and edit first message
        const editButton = getAllByTestId('message-edit-button');
        fireEvent.click(editButton[0]);
        const editArea = getByDisplayValue('Hello');
        expect(editArea).toBeInTheDocument();

        // Change the message value
        fireEvent.change(editArea, { target: { value: 'Hello2' } });

        // Click cancel and check onUpdate is not called
        const cancelButton = getByRole('button', { name: /cancel/i });
        fireEvent.click(cancelButton);
        expect(onUpdate).toHaveBeenCalledTimes(0);
    });

    it('save edited message should trigger onUpdate', () => {
        const onUpdate = jest.fn();
        const { getByRole, getAllByTestId, getAllByRole, getByDisplayValue } = render(
            <RenderChat activeUser={mockUser1} onUpdate={onUpdate} value={mockMessages} />
        );

        // Check no messages are currently in edit mode
        expect(getAllByRole('textbox')).toHaveLength(1);

        // Start editing first message
        const editButton = getAllByTestId('message-edit-button');
        fireEvent.click(editButton[0]);
        const editArea = getByDisplayValue('Hello');
        expect(editArea).toBeInTheDocument();

        // Change the message value and save the changes
        fireEvent.change(editArea, { target: { value: 'Hello2' } });
        const saveButton = getByRole('button', { name: /save/i });
        fireEvent.click(saveButton);

        // Check that onUpdate was called with the new message
        expect(onUpdate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ message: 'Hello2' })]));
        // Check that the message timestamp was updated
        const firstCallArgument = onUpdate.mock.calls[0][0]; // Get the first argument of the first call
        const firstMessage = firstCallArgument[0];
        expect(firstMessage.created_at).not.toBe(firstMessage.updated_at);
    });

    it('delete message should trigger onUpdate', () => {
        const onUpdate = jest.fn();
        const { getAllByTestId } = render(
            <RenderChat activeUser={mockUser1} onUpdate={onUpdate} value={mockMessages} />
        );

        // Delete the first message
        const deleteButton = getAllByTestId('message-delete-button');
        fireEvent.click(deleteButton[0]);

        expect(onUpdate).toHaveBeenCalledWith(mockMessages.slice(1));
    });

    it('user should not be able to edit/delete a message that does not belong to them', () => {
        const { getAllByTestId, queryByTestId, rerender } = render(
            <RenderChat activeUser={mockUser3} value={mockMessages} />
        );

        // Check if user can edit any messages. Since user3 has not sent any, this should be none
        expect(queryByTestId('message-delete-button')).not.toBeInTheDocument();
        expect(queryByTestId('message-edit-button')).not.toBeInTheDocument();

        // Rerender with a different active user that has already sent a message
        rerender(<RenderChat activeUser={mockUser2} value={mockMessages} />);

        // Check that they can now see the edit and delete buttons for the message they sent
        expect(getAllByTestId('message-delete-button')).toHaveLength(1);
        expect(getAllByTestId('message-edit-button')).toHaveLength(1);
    });
});
