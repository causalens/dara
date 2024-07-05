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
import { useContext } from 'react';

import { Tooltip } from '@darajs/ui-components';
import { DownLeftAndUpRightToCenter, UpRightAndDownLeftFromCenter } from '@darajs/ui-icons';

import PointerContext from '../../pointer-context';
import { FloatingButton } from '../floating-elements';

interface CollapseExpandGroupButtonProps {
    onCollapseAll: () => void | Promise<void>;
    onExpandAll: () => void | Promise<void>;
    showExpandAll: boolean;
}

function CollapseExpandGroupButton(props: CollapseExpandGroupButtonProps): JSX.Element {
    const { disablePointerEvents } = useContext(PointerContext);
    const buttonText = props.showExpandAll ? 'Collapse All' : 'Expand All';

    return (
        <Tooltip content={buttonText} placement="bottom">
            <FloatingButton
                aria-label={buttonText}
                disableEvents={disablePointerEvents}
                fixedSize
                onClick={props.showExpandAll ? props.onCollapseAll : props.onExpandAll}
                style={{ padding: '0 0.75rem' }}
            >
                {props.showExpandAll ?
                    <DownLeftAndUpRightToCenter />
                :   <UpRightAndDownLeftFromCenter />}
            </FloatingButton>
        </Tooltip>
    );
}

export default CollapseExpandGroupButton;
