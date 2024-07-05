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
import styled from '@darajs/styled-components';
import { Button, Modal } from '@darajs/ui-components';

import { ConfirmationModalProps } from './confirmation-modal-props';
import useConfirmationModal from './use-confirmation-modal';

const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    width: 400px;
    padding: 12px;
`;

const Footer = styled.div`
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
`;

/**
 * The visual part of the CC Modal system, renders the message along with buttons to confirm or cancel the cancellation.
 *
 * @param props the component props
 */
function ConfirmationModal(props: ConfirmationModalProps): JSX.Element {
    return (
        <Modal onAttemptClose={props.onCancel} render={props.render} style={props.style}>
            <Wrapper>
                <h4>{props.title ?? 'Confirm Cancellation'}</h4>
                {props.message}
                <Footer>
                    <Button onClick={props.onCancel} styling="secondary">
                        Cancel
                    </Button>
                    <Button onClick={props.onConfirm} styling="error">
                        Confirm
                    </Button>
                </Footer>
            </Wrapper>
        </Modal>
    );
}

ConfirmationModal.useConfirmationModal = useConfirmationModal;

export default ConfirmationModal;
