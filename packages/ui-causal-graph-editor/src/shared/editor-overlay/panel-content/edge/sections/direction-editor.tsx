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
import { Button } from '@darajs/ui-components';
import { ArrowLeft, ArrowRight } from '@darajs/ui-icons';

import { useSettings } from '@shared/settings-context';

import { EdgeType, EditorMode } from '@types';

const EdgeName = styled.h6`
    overflow: hidden;

    width: 40%;
    max-height: 3.75rem;
    margin: 0;

    font-size: 1rem;
    font-weight: 700;
    line-height: 1.25rem;
    color: ${(props) => props.theme.colors.text};
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ArrowsWrapper = styled.div`
    display: flex;
    flex-direction: column;
    width: 10%;
    color: ${(props) => props.theme.colors.text};
`;

const ArrowButton = styled(Button)`
    width: 1rem;
    min-width: 0;
    height: 1rem;
    margin: 0;
    padding: 0;

    color: ${(props) => props.theme.colors.grey3};
    ${(props) =>
        props.disabled &&
        `
        user-select: none;
        cursor: default;
        background-color: transparent;
        color: ${props.theme.colors.text};
    `};
`;

const HorizontalLine = styled.hr`
    position: relative;
    top: 2px;

    width: 1.75rem;
    margin: 0;

    border-top: 2px solid ${(props) => props.theme.colors.text};
`;

const ReminderText = styled.span`
    width: 100%;
    font-weight: 400;
    color: ${(props) => props.theme.colors.primary};
    text-align: center;
`;

const DirectionEditorWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

interface DirectionEditorProps {
    /** Current edge type */
    edgeType: EdgeType;
    /** Handler to confirm/reverse currently selected edge */
    onConfirmDirection: (reverse: boolean) => void;
    /**
     * Name of the edge source
     */
    source: string;
    /**
     * Name of the edge target
     */
    target: string;
}

/**
 * Displays the direction of the edge, allows user to change in resolver mode
 */
function DirectionEditor(props: DirectionEditorProps): JSX.Element {
    const { editable, editorMode } = useSettings();

    const canChangeDirection = editable && EditorMode.RESOLVER === editorMode;

    return (
        <>
            <DirectionEditorWrapper>
                <EdgeName>{props.source}</EdgeName>
                {canChangeDirection && (
                    <ArrowsWrapper>
                        <ArrowButton
                            disabled={props.edgeType === EdgeType.DIRECTED_EDGE}
                            onClick={() => props.onConfirmDirection(false)}
                            styling="ghost"
                        >
                            <ArrowRight />
                        </ArrowButton>
                        <ArrowButton onClick={() => props.onConfirmDirection(true)} styling="ghost">
                            <ArrowLeft />
                        </ArrowButton>
                    </ArrowsWrapper>
                )}
                {!canChangeDirection && (
                    <ArrowsWrapper>
                        {editorMode === EditorMode.PAG_VIEWER && <HorizontalLine />}
                        {editorMode !== EditorMode.PAG_VIEWER && <ArrowRight />}
                    </ArrowsWrapper>
                )}
                <EdgeName>{props.target}</EdgeName>
            </DirectionEditorWrapper>
            {canChangeDirection && props.edgeType !== EdgeType.DIRECTED_EDGE && (
                <ReminderText>Select edge direction</ReminderText>
            )}
        </>
    );
}

export default DirectionEditor;
