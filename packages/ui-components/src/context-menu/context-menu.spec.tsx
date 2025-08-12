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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import ContextMenu, { ContextMenuProps, MenuAction } from './context-menu';

const TestAction: MenuAction = {
    action: jest.fn(),
    label: 'TestAction',
};

function RenderContextMenu(props: ContextMenuProps<any> = { actions: [TestAction] }): JSX.Element {
    const Menu = ContextMenu('textarea');
    return (
        <ThemeProvider theme={theme}>
            <Menu {...props} />
        </ThemeProvider>
    );
}

/**
 * Because of popper side effects happening during the initial render, the render functions
 * need to be wrapped in an async `act` function to prevent the warnings
 *
 * According to: https://github.com/facebook/react/issues/15379#issuecomment-482101020
 */
describe('Context Menu', () => {
    it('should display correctly and hide menu by default', async () => {
        render(RenderContextMenu());

        await waitFor(() => {
            const body = document.querySelector('body');
            if (!body) {
                throw new Error('Body not found');
            }
            expect(body.children).toHaveLength(2);
        });
        const body = document.querySelector('body');
        if (!body) {
            throw new Error('Body not found');
        }
        const [textAreaWrapper, portalRoot] = body.children;
        // Textarea wrapper should have a textarea inside
        expect(textAreaWrapper.children[0].tagName).toBe('TEXTAREA');
        // Portal root should exist but be empty when menu is closed
        expect(portalRoot.tagName).toBe('DIV');
        expect(portalRoot.id).toBe('headlessui-portal-root');
        expect(portalRoot.children).toHaveLength(1);
        expect(portalRoot.children[0]).toHaveAttribute('data-headlessui-portal', '');
    });

    it('should open with clickable items when right clicked', async () => {
        render(RenderContextMenu());

        const body = document.querySelector('body');
        if (!body) {
            throw new Error('Body not found');
        }
        const [textAreaWrapper] = body.children;

        // Right click textarea to open context menu
        fireEvent.contextMenu(textAreaWrapper.children[0]);

        // Wait for contextmenu to appear
        await waitFor(() => screen.getByText(TestAction.label));

        const contextMenu = screen.getByText(TestAction.label).parentElement;
        expect(contextMenu).toHaveStyle({
            display: 'flex',
        });
    });

    it('should invoke correct function and close context menu on click', async () => {
        render(RenderContextMenu());

        const body = document.querySelector('body');
        if (!body) {
            throw new Error('Body not found');
        }
        const [textAreaWrapper] = body.children;

        // Right click textarea to open context menu
        fireEvent.contextMenu(textAreaWrapper.children[0]);

        // Wait for menu to appear and get the action element
        const actionElement = await waitFor(() => screen.getByText(TestAction.label));

        // Click on the action
        fireEvent.click(actionElement);

        // Correct method should be called
        await waitFor(() => expect(TestAction.action).toHaveBeenCalledTimes(1));

        // Menu should be closed (element should no longer be in DOM)
        await waitFor(() => {
            expect(screen.queryByText(TestAction.label)).toBeNull();
        });
    });
});
