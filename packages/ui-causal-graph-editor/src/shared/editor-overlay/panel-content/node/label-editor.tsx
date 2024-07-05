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
import debounce from 'lodash/debounce';
import { useCallback, useMemo, useState } from 'react';

import styled from '@darajs/styled-components';
import { Input } from '@darajs/ui-components';

import { useSettings } from '@shared/settings-context';

import { SimulationNode } from '@types';

const StyledInput = styled(Input)`
    width: 100%;

    input {
        width: 100%;
    }
`;

const LabelEditorWrapper = styled.div<{ $editable: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    margin: 2rem 0;

    color: ${(props) => props.theme.colors.grey6};

    span {
        cursor: ${(props) => (props.$editable ? 'pointer' : 'inherit')};

        overflow: hidden;

        max-width: 80%;
        margin: 0;
        padding: 0.25rem 0.5rem;

        font-size: 1.2rem;
        font-weight: bold;
        text-overflow: ellipsis;
        white-space: nowrap;

        ${(props) =>
            props.$editable &&
            `
            border: 1px solid ${props.theme.colors.grey2};
            border-radius: 4px;

            :hover {
                background-color: ${props.theme.colors.grey2};
            }
        `}
    }
`;

interface LabelEditorProps {
    node: SimulationNode;
    onLabelChange: (name: string, val: string) => void | Promise<void>;
}

/**
 * Displays the label of the node, allows user to change it editable
 */
function LabelEditor(props: LabelEditorProps): JSX.Element {
    const { editable } = useSettings();
    const [editEnabled, setEditEnabled] = useState(false);

    const [label, setLabel] = useState(props.node['meta.rendering_properties.label'] ?? props.node.id);

    const updateLabel = useCallback(
        (id: string, val: string) => {
            props.onLabelChange(id, val);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [props.onLabelChange]
    );
    const debouncedUpdateLabel = useMemo(() => debounce(updateLabel, 300), [updateLabel]);

    function onLabelChange(val: string): void {
        setLabel(val);
        debouncedUpdateLabel(props.node.id, val);
    }

    function onEnableEditing(): void {
        if (editable) {
            setEditEnabled(true);
        }
    }

    return (
        <LabelEditorWrapper $editable={editable}>
            {editable && editEnabled ?
                <StyledInput onChange={onLabelChange} value={label} />
            :   <span
                    onClick={() => onEnableEditing()}
                    onKeyDown={(k) => k.key === 'Enter' && onEnableEditing()}
                    role="button"
                    tabIndex={0}
                >
                    {label}
                </span>
            }
        </LabelEditorWrapper>
    );
}

export default LabelEditor;
