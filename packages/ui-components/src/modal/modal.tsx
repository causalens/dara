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
import { useEffect, useState } from 'react';
import * as React from 'react';
import ReactDOM from 'react-dom';

import styled from '@darajs/styled-components';

import { Key } from '../constants';

interface RenderProp {
    render: boolean;
}

const Background = styled.div<RenderProp>`
    position: fixed;
    z-index: 2000;
    top: 0;
    left: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 100%;
    height: 100%;

    opacity: ${(props) => (props.render ? 1 : 0)};
    background-color: ${(props) => props.theme.colors.modalBg};

    transition: opacity ease-in 0.1s;
`;

const ModalWrapper = styled.div<RenderProp>`
    overflow: hidden;
    display: inline-flex;
    flex-direction: column;

    min-width: 20rem;
    max-width: 80vw;
    min-height: 10rem;
    max-height: 80vh;
    margin-top: ${(props) => (props.render ? 0 : '-50px')};
    padding: 1.75rem;

    font-size: ${(props) => props.theme.font.size};

    background-color: ${(props) => props.theme.colors.grey1};
    border-radius: 0.25rem;
    box-shadow: ${(props) => props.theme.shadow.medium};

    transition: margin-top ease-in 0.1s;
`;

/** Modal footer component, that arranges the buttons to each side and adds space around them */
const ModalFooter = styled.div`
    display: flex;
    flex: 0 0 auto;
    justify-content: space-between;
    margin-top: 1rem;
`;

interface ModalHeaderProps {
    flexDirection?: string;
}

/** Arranges the modal header and adds some space below it */
const ModalHeader = styled.div<ModalHeaderProps>`
    display: flex;
    flex: 0 0 auto;
    flex-direction: ${(props) => props.flexDirection || 'column'};
    justify-content: space-between;

    margin-bottom: 1rem;
`;

export interface ModalProps {
    /** The content of the modal should be passed as children */
    children: React.ReactNode;
    /** Standard react className property */
    className?: string;
    /** Component Id */
    id?: string;
    /**
     * An optional event listener for if an external event (e.g. esc key) tries to close the modal, it's up to the
     * parent component to decide whether to close the modal
     */
    onAttemptClose?: () => void | Promise<void>;
    /** Handler that's called when the modal has finished closing and has unmounted */
    onClosed?: () => void | Promise<void>;
    /** Whether to render the modal content or not */
    render: boolean;
    /** Native react style property */
    style?: React.CSSProperties;
}

/**
 * A simple modal component, accepts children and a render property. It handles attaching the modal to the body of the
 * document and transitioning it in and out of view as required
 *
 * @param {ModalProps} props - the component props
 */
function Modal(props: ModalProps): JSX.Element {
    const [mounted, setMounted] = useState(false);
    const [renderModal, setRenderModal] = useState(false);

    // Internal state is updated using the useEffect to delay it to the next tick. This allows for the components css
    // animations to work correctly
    useEffect(() => {
        setRenderModal(props.render);
    }, [props.render]);

    useEffect(() => {
        if (renderModal) {
            const keyHandler = (e: KeyboardEvent): void => {
                if (e.key === Key.ESCAPE && props.onAttemptClose) {
                    props.onAttemptClose();
                }
            };
            document.addEventListener('keydown', keyHandler);
            return () => {
                document.removeEventListener('keydown', keyHandler);
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renderModal, props.onAttemptClose]);

    if (!props.render && !mounted) {
        return null;
    }

    const onTransitionEnd = (): void => {
        setMounted(props.render);
        if (!props.render && props.onClosed) {
            props.onClosed();
        }
    };

    const stopPropagation = (e: React.MouseEvent<HTMLDivElement>): void => {
        e.stopPropagation();
    };

    return ReactDOM.createPortal(
        <Background id={props.id} onClick={props.onAttemptClose} onTransitionEnd={onTransitionEnd} render={renderModal}>
            <ModalWrapper
                className={`cl-modal-content ${props.className ?? ''}`}
                onClick={stopPropagation}
                render={renderModal}
                style={props.style}
            >
                {props.children}
            </ModalWrapper>
        </Background>,
        document.body
    );
}

export default Modal;
export { ModalFooter, ModalHeader };
