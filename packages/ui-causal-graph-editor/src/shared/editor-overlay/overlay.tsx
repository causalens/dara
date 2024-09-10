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

import PointerContext from '@shared/pointer-context';
import { useSettings } from '@shared/settings-context';

import { PanelContent } from './panel-content';
import {
    BottomDiv,
    BottomLeftDiv,
    BottomRightDiv,
    TopCenterDiv,
    TopDiv,
    TopLeftDiv,
    TopLeftDivContent,
    TopRightDiv,
} from './positional-divs';

interface EditorOverlayProps {
    /** Render prop for content to place in the bottom left of the overlay */
    bottomLeft?: React.ReactNode;
    /** Render prop for content to place in the bottom right of the overlay */
    bottomRight?: React.ReactNode;
    /** Children */
    children?: React.ReactNode;
    /** Whether to disable the panel */
    disabled?: boolean;
    /** Whether to hide the frame and show just the graph */
    hideFrame?: boolean;
    /** Function to delete currently selected content */
    onDelete: () => void | Promise<void>;
    /** Function to select the next edge/node */
    onNext: () => void | Promise<void>;
    /** Function to select the previous edge/node */
    onPrev: () => void | Promise<void>;
    /** When set to true, the elements inside the overlay become visible */
    showFrameButtons?: boolean;
    /** Panel title */
    title?: string;
    /** Render prop for content to place in the top center of the overlay */
    topCenter?: React.ReactNode;
    /** Render prop for content to place in the top left of the overlay */
    topLeft?: React.ReactNode;
    /** Render prop for content to place in the top right of the overlay */
    topRight?: React.ReactNode;
    /**
     * Loading indicator to show
     */
    loadingIndicator?: React.ReactNode;
    /** Whether there is valid content selected */
    validContentSelected: boolean;
}

/**
 * The EditorOverlay component creates an overlay for use with a Graph
 * This overlay goes on top of a graph and provides actions in each corner
 * This overlay also includes a dissmissable info panel
 */
function EditorOverlay(props: EditorOverlayProps): JSX.Element {
    const { editable, allowSelectionWhenNotEditable } = useSettings();
    const { onPanelEnter, onPanelExit } = useContext(PointerContext);

    if (props.hideFrame) {
        return null;
    }

    const controlPadding = '10px';

    const showPanel = editable || allowSelectionWhenNotEditable;

    return (
        <>
            <TopDiv padding={controlPadding}>
                {/*  We only apply the show flag to content, as we want the indicator to always appear */}
                <TopLeftDiv onMouseEnter={onPanelEnter} onMouseLeave={onPanelExit}>
                    <TopLeftDivContent $show={props.showFrameButtons}>{props.topLeft}</TopLeftDivContent>
                    {props.loadingIndicator}
                </TopLeftDiv>
                <TopCenterDiv $show={props.showFrameButtons} onMouseEnter={onPanelEnter} onMouseLeave={onPanelExit}>
                    {props.topCenter}
                </TopCenterDiv>
                <TopRightDiv $show={props.showFrameButtons} onMouseEnter={onPanelEnter} onMouseLeave={onPanelExit}>
                    {props.topRight}
                </TopRightDiv>
            </TopDiv>

            <BottomDiv $show={props.showFrameButtons} padding={controlPadding}>
                <BottomLeftDiv onMouseEnter={onPanelEnter} onMouseLeave={onPanelExit}>
                    {props.bottomLeft}
                </BottomLeftDiv>
                <BottomRightDiv onMouseEnter={onPanelEnter} onMouseLeave={onPanelExit}>
                    {props.bottomRight}
                </BottomRightDiv>
            </BottomDiv>

            {showPanel && props.validContentSelected && (
                <PanelContent
                    disabled={props.disabled}
                    onDelete={props.onDelete}
                    onMouseEnter={onPanelEnter}
                    onMouseLeave={onPanelExit}
                    onNext={props.onNext}
                    onPrev={props.onPrev}
                    title={props.title}
                >
                    {props.children ?? null}
                </PanelContent>
            )}
        </>
    );
}

export default EditorOverlay;
