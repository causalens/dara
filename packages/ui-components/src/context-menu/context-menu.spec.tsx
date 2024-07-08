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
            expect(document.querySelector('body').children).toHaveLength(2);
        });
        const [textAreaWrapper, contextMenu] = document.querySelector('body').children;
        // Textarea wrapper should have a textarea inside
        expect(textAreaWrapper.children[0].tagName).toBe('TEXTAREA');
        // Contextmenu should be a div list and should be closed by default
        expect(contextMenu.tagName).toBe('DIV');
        expect(contextMenu).toHaveStyle({
            display: 'none',
        });
        // The action should still be in the dom regardless of the contextmenu being hidden
        expect(contextMenu.children[0]).toHaveAttribute('title', TestAction.label);
    });

    it('should open with clickable items when right clicked', async () => {
        render(RenderContextMenu());

        // Wait for rendering to finish - prevents popper errors
        await waitFor(() => screen.getByTitle(TestAction.label));

        const body = document.querySelector('body');
        const [textAreaWrapper] = body.children;

        // Right click textarea, wait for contextmenu to appear
        fireEvent.contextMenu(textAreaWrapper.children[0]);
        await waitFor(() => {
            const contextMenu = screen.getByTitle(TestAction.label).parentElement;
            expect(contextMenu).toHaveStyle({
                display: 'flex',
            });
        });
    });

    it('should invoke correct function and close context menu on click', async () => {
        render(RenderContextMenu());

        // Wait for rendering to finish - prevents popper errors
        const actionElement = await waitFor(() => screen.getByTitle(TestAction.label));

        // Click on the action
        fireEvent.mouseUp(actionElement);

        // Correct method should be called
        await waitFor(() => expect(TestAction.action).toHaveBeenCalledTimes(1));

        // Menu should be closed
        expect(screen.getByTitle(TestAction.label).parentElement).toHaveStyle({
            display: 'none',
        });
    });
});
