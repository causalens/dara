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
import { Dispatch, SetStateAction, useContext } from 'react';

import { useTheme } from '@darajs/styled-components';
import { Tooltip } from '@darajs/ui-components';
import { Arrows } from '@darajs/ui-icons';

import PointerContext from '@shared/pointer-context';
import { useSettings } from '@shared/settings-context';
import { DragMode } from '@shared/use-drag-mode';

import { FloatingButton } from '../floating-elements';

interface DragModeButtonProps {
    /** Current drag mode */
    dragMode: DragMode;
    /** Handler to update drag mode */
    setDragMode: Dispatch<SetStateAction<DragMode>>;
}

function DragModeButton(props: DragModeButtonProps): JSX.Element {
    const { editable, disableEdgeAdd, allowNodeDrag } = useSettings();
    const { disablePointerEvents } = useContext(PointerContext);
    const theme = useTheme();

    const isMoveNode = props.dragMode === 'move_node';

    return (
        <>
            {editable && !disableEdgeAdd && allowNodeDrag && (
                <Tooltip
                    content={`Drag behaviour: ${
                        isMoveNode ? 'Node Move' : 'Edge Creation'
                    }. Press and hold Command or Control to switch mode temporarily`}
                    placement="bottom"
                >
                    <FloatingButton
                        aria-label="Toggle drag behaviour"
                        disableEvents={disablePointerEvents}
                        fixedSize
                        onClick={() => props.setDragMode(isMoveNode ? 'create_edge' : 'move_node')}
                        style={{
                            color: isMoveNode ? theme.colors.primary : theme.colors.grey4,
                        }}
                    >
                        <Arrows />
                    </FloatingButton>
                </Tooltip>
            )}
        </>
    );
}

export default DragModeButton;
