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
import { Refresh } from '@darajs/ui-icons';

import PointerContext from '@shared/pointer-context';

import { FloatingButton } from '../floating-elements';

interface RecalculateLayoutButtonProps {
    /** Handler for resetting the layout */
    onResetLayout: () => void | Promise<void>;
}

function RecalculateLayoutButton(props: RecalculateLayoutButtonProps): JSX.Element {
    const { disablePointerEvents } = useContext(PointerContext);

    return (
        <Tooltip content="Recalculate Layout" placement="bottom">
            <FloatingButton
                aria-label="Recalculate Layout"
                disableEvents={disablePointerEvents}
                fixedSize
                onClick={props.onResetLayout}
            >
                <Refresh />
            </FloatingButton>
        </Tooltip>
    );
}

export default RecalculateLayoutButton;
