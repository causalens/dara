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
import React, { useEffect, useMemo, useState } from 'react';

export type DragMode = 'create_edge' | 'move_node';

/**
 * Helper hook controlling switching and enabling drag mode
 *
 * @param editMode whether app is in edit mode
 * @param allowEdgeAdd whether to allow adding edges
 * @param allowNodeDrag whether to allow node dragging
 * @param onDragModeChange callback to execute whenever drag mode changes
 */
function useDragMode(
    editMode: boolean,
    allowEdgeAdd: boolean,
    allowNodeDrag: boolean,
    onDragModeChange: (dragMode: DragMode | null) => void
): { dragEnabled: boolean; dragMode: DragMode; setDragMode: React.Dispatch<React.SetStateAction<DragMode>> } {
    const [dragMode, setDragMode] = useState<DragMode>(() => {
        if (editMode && allowEdgeAdd) {
            return 'create_edge';
        }

        return allowNodeDrag ? 'move_node' : null;
    });
    const dragEnabled = useMemo(() => {
        if (dragMode === 'create_edge') {
            return editMode && allowEdgeAdd;
        }

        if (dragMode === 'move_node') {
            return allowNodeDrag;
        }

        return false;
    }, [dragMode, editMode, allowEdgeAdd, allowNodeDrag]);

    useEffect(() => {
        if (!dragEnabled) {
            onDragModeChange(null);
        } else {
            onDragModeChange(dragMode);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragMode, dragEnabled]);

    // Register listener to switch modes in edit mode
    // In non-edit mode we stay in one mode only
    useEffect(() => {
        const cmdHandler = (ev: KeyboardEvent): void => {
            // Left Alt (for Windows&Mac) or Left CMD (for OSX)
            const codes = ['AltLeft', 'MetaLeft', 'OSLeft'];
            if (codes.includes(ev.code)) {
                setDragMode(dragMode === 'move_node' ? 'create_edge' : 'move_node');
            }
        };

        // If both edge adding and node dragging is not allowed, there is no point in switching modes
        if (editMode && allowEdgeAdd && allowNodeDrag) {
            document.addEventListener('keydown', cmdHandler);
            document.addEventListener('keyup', cmdHandler);
        }

        return () => {
            if (editMode && allowEdgeAdd && allowNodeDrag) {
                document.removeEventListener('keydown', cmdHandler);
                document.removeEventListener('keyup', cmdHandler);
            }
        };
    }, [allowEdgeAdd, allowNodeDrag, dragMode, editMode]);

    return { dragEnabled, dragMode, setDragMode };
}

export default useDragMode;
