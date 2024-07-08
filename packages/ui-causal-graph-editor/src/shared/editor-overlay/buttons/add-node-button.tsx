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
import { Plus } from '@darajs/ui-icons';

import PointerContext from '@shared/pointer-context';

import { EditorMode } from '../../../types';
import { useSettings } from '../../settings-context';
import { FloatingButton } from '../floating-elements';

interface EditControlsProps {
    /** Handler for adding a new node */
    onAddNode: () => void;
}

function EditControls(props: EditControlsProps): JSX.Element {
    const { disableLatentNodeAdd, editorMode, editable } = useSettings();
    const { disablePointerEvents } = useContext(PointerContext);

    return (
        <>
            {editable && editorMode !== EditorMode.EDGE_ENCODER && !disableLatentNodeAdd && (
                <Tooltip content="Add Latent Node" placement="bottom">
                    <FloatingButton
                        aria-label="Add Latent Node"
                        disableEvents={disablePointerEvents}
                        fixedSize
                        onClick={props.onAddNode}
                    >
                        <Plus />
                    </FloatingButton>
                </Tooltip>
            )}
        </>
    );
}

export default EditControls;
