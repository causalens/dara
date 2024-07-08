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
import { useMemo, useRef, useState } from 'react';

import styled from '@darajs/styled-components';
import { Input } from '@darajs/ui-components';
import { useOnClickOutside } from '@darajs/ui-utils';

interface LayerLabelEditorProps {
    /**
     * The label to be edited
     */
    label?: string;
    /**
     * The index of the layer in the hierarchy
     */
    number: number;
    /**
     * Callback to be called when the label changes
     */
    onChange: (label: string) => void;
    /**
     * Whether we're in view-only mode
     */
    viewOnly?: boolean;
}

const StyledInput = styled(Input)`
    width: 100%;

    input {
        width: 100%;
        padding: 0 0.5rem;
    }
`;

const LabelStaticDisplay = styled.div<{ $viewOnly: boolean }>`
    cursor: ${(props) => (props.$viewOnly ? 'inherit' : 'pointer')};
    user-select: none;

    overflow: hidden;
    display: box; /* stylelint-disable-line declaration-property-value-no-unknown */

    width: 20ch;
    max-width: 100%;
    margin: 0;
    padding: 0.5rem calc(0.5rem + 1px); /* so its aligned with the input having 1px border */

    font-size: 1rem;
    color: ${(props) => props.theme.colors.grey4};

    border-radius: 4px;

    box-align: center; /* stylelint-disable-line property-no-unknown */

    box-orient: vertical; /* stylelint-disable-line property-no-unknown */

    box-pack: center; /* stylelint-disable-line property-no-unknown */

    -webkit-line-clamp: 3;

    ${(props) =>
        !props.$viewOnly &&
        `
    :hover {
        background-color: ${props.theme.colors.grey2};
    }
    `}
`;

const LabelEditorWrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;

    width: 100%;
    min-height: 2.5rem;
`;

/**
 * Displays the label of the layer, allows user to change it if editable
 */
function LayerLabelEditor(props: LayerLabelEditorProps): JSX.Element {
    const [editEnabled, setEditEnabled] = useState(false);
    const [label, setLabel] = useState(null);

    const ref = useRef(null);
    useOnClickOutside(ref.current, () => setEditEnabled(false));

    const debouncedUpdateLabel = useMemo(() => debounce(props.onChange, 300), [props.onChange]);

    function onLabelChange(val: string): void {
        setLabel(val);
        debouncedUpdateLabel(val);
    }

    function onEnableEditing(): void {
        if (props.viewOnly) {
            return;
        }

        setEditEnabled(true);
    }

    const labelToDisplay = label ?? props.label ?? `Tier ${props.number}`;

    return (
        <LabelEditorWrapper ref={ref}>
            {editEnabled ?
                <StyledInput
                    autoFocus
                    onChange={onLabelChange}
                    onComplete={() => setEditEnabled(false)}
                    value={labelToDisplay}
                />
            :   <LabelStaticDisplay
                    $viewOnly={props.viewOnly}
                    onClick={() => onEnableEditing()}
                    onKeyDown={(k) => k.key === 'Enter' && onEnableEditing()}
                    role="button"
                    tabIndex={0}
                >
                    <span>{labelToDisplay}</span>
                </LabelStaticDisplay>
            }
        </LabelEditorWrapper>
    );
}

export default LayerLabelEditor;
