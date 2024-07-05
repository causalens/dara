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
import { fireEvent, render } from '@testing-library/react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import Modal, { ModalProps } from './modal';

const CHILDREN = 'children';

function RenderModal(props: ModalProps = { children: CHILDREN, id: 'modal', render: false }): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <Modal {...props} />
        </ThemeProvider>
    );
}

describe('Modal', () => {
    it('should not display if render is false', () => {
        const { queryByText } = render(RenderModal());

        // Initially, modal doesn't display at all
        const modalContent = queryByText(CHILDREN);
        expect(modalContent).not.toBeInTheDocument();
    });

    it('should display correctly if render is true', async () => {
        const { findByText } = render(RenderModal({ children: CHILDREN, id: 'modal', render: true }));

        const modalContent = await findByText(CHILDREN);
        expect(modalContent).toBeInTheDocument();
        expect(modalContent.parentElement).toBeInTheDocument();
        expect(modalContent.parentElement).toHaveStyle({
            opacity: 1,
        });
    });

    it('should unmount and call onClosed after transition', async () => {
        const onClose = jest.fn();
        const { findByText, queryByText, rerender } = render(
            RenderModal({ children: CHILDREN, id: 'modal', onClosed: onClose, render: true })
        );

        // Wait for modal to finish mounting
        let modelContent = await findByText(CHILDREN);
        // Fire off transition-end so it sets `mounted` properly
        fireEvent.transitionEnd(modelContent.parentElement);
        await findByText(CHILDREN);

        // Re-render with render=false
        rerender(RenderModal({ children: CHILDREN, id: 'modal', onClosed: onClose, render: false }));

        // The model should still be there, onClosed should not be called
        modelContent = await findByText(CHILDREN);
        expect(modelContent).toBeInTheDocument();
        expect(onClose).toHaveBeenCalledTimes(0);

        // Fire off transition-end
        fireEvent.transitionEnd(modelContent.parentElement);

        // Only now after ending the transition should the model unmount and call onClosed
        modelContent = queryByText(CHILDREN);
        expect(modelContent).not.toBeInTheDocument();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onAttemptClose when background is clicked or escape is pressed', async () => {
        const attemptClose = jest.fn();
        const { findByText, container } = render(
            RenderModal({ children: CHILDREN, id: 'modal', onAttemptClose: attemptClose, render: true })
        );

        // Wait for modal to finish mounting
        const modelContent = await findByText(CHILDREN);

        // 1. click background
        fireEvent.click(modelContent.parentElement);
        expect(attemptClose).toHaveBeenCalledTimes(1);

        // 2. press escape
        fireEvent.keyDown(container, { key: 'Escape' });
        expect(attemptClose).toHaveBeenCalledTimes(2);
    });
});
