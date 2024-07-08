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
import { Textarea } from '@darajs/ui-components';

import { useSettings } from '@shared/settings-context';
import { GraphApi } from '@shared/use-causal-graph-editor';

import { SimulationEdge } from '@types';

import { ColumnWrapper, SectionTitle } from '../../styled';

const EdgeNote = styled(Textarea)`
    width: 100%;

    div,
    textarea {
        width: 100%;
    }

    & > div::after {
        background-color: ${(props) => props.theme.colors.blue1};
    }

    textarea {
        resize: vertical;
        max-height: 8rem;
        background-color: ${(props) => props.theme.colors.blue1};

        &:disabled {
            color: ${(props) => props.theme.colors.grey3};
        }
    }
`;

interface DescriptionEditorProps {
    /** Graph API */
    api: GraphApi;
    /**
     * Selected edge attributes
     */
    edge: SimulationEdge;
    /** Selected edge */
    selectedEdge: [string, string];
}

function DescriptionEditor(props: DescriptionEditorProps): JSX.Element {
    const { editable } = useSettings();
    const [note, setNote] = useState(() => props.edge['meta.rendering_properties.description'] || '');

    const updateNote = useCallback(
        (newDesc: string) => {
            props.api.updateEdgeNote(props.selectedEdge, newDesc);
        },
        [props.api, props.selectedEdge]
    );
    const debouncedUpdateNote = useMemo(() => debounce(updateNote, 300), [updateNote]);

    function onNoteChange(newDesc: string): void {
        setNote(newDesc);
        debouncedUpdateNote(newDesc);
    }

    return (
        <ColumnWrapper>
            <SectionTitle>Note</SectionTitle>
            <EdgeNote
                disabled={!editable}
                onChange={(newDesc) => onNoteChange(newDesc)}
                placeholder="Add a note."
                value={note}
            />
        </ColumnWrapper>
    );
}

export default DescriptionEditor;
