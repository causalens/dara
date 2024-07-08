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
import { Plus } from '@darajs/ui-icons';

const LayerBorder = styled.div`
    position: absolute;
    top: 0;
    right: 0;
    left: 0;

    width: 100%;

    &::before {
        content: '';

        position: absolute;
        top: 50%;
        right: 0;
        left: 0;
        transform: translateY(-50%);

        width: 100%;
        height: 1px;

        background: ${(props) => props.theme.colors.grey3};

        transition:
            background-color 0.15s cubic-bezier(0.4, 0, 1, 1),
            height 0.15s cubic-bezier(0.4, 0, 1, 1);
    }
`;

const DividerButton = styled.button`
    pointer-events: none;

    position: absolute;
    z-index: 2;
    top: -12px; /* centers it on the line */
    left: 30px; /* left offset */

    display: flex;
    align-items: center;
    justify-content: center;

    width: 24px;
    height: 24px;
    margin: 0;
    padding: 0;

    color: ${(props) => props.theme.colors.background};

    opacity: 0;
    background-color: ${(props) => props.theme.colors.primary};
    border: none;
    border-radius: 50%;
    outline: none;

    transition: opacity 0.1s cubic-bezier(0.4, 0, 1, 1);
`;

const LayerAddArea = styled.button<{ $viewOnly: boolean }>`
    cursor: ${(props) => (props.$viewOnly ? 'inherit' : 'pointer')};

    /* Make it centered on the line */
    position: absolute;
    z-index: 1;
    top: -7px;

    width: 100%;
    height: 14px;
    margin: 0;
    padding: 0;

    background-color: transparent;
    border: none;
    outline: none;

    /* When AddArea is hovered, adjust border styles */
    ${(props) =>
        !props.$viewOnly &&
        `
    &:hover {
        & ~ ${LayerBorder}::before {
            height: 4px;
            background: ${props.theme.colors.primary};
        }

        & ~ ${DividerButton} {
            opacity: 1;
        }
    }
    `};
`;

const LayerDividerWrapper = styled.div<{ $position: 'top' | 'bottom' }>`
    position: absolute;
    right: 0;
    left: 0;

    ${(props) => (props.$position === 'top' ? 'bottom: 100%;' : 'top: 100%;')}

    width: 100%;

    outline: none;
`;

interface LayerDividerProps {
    /** Click handler */
    onClick: () => void;
    /** Where to position the divider in relation to its parent */
    position?: 'top' | 'bottom';
    /** Whether we're in view-only mode */
    viewOnly?: boolean;
}

/**
 * A divider between layers in the hierarchy builder; allows adding a new layer in between two existing ones
 * or at the start/end of the hierarchy
 */
function LayerDivider({ onClick, position = 'bottom', viewOnly }: LayerDividerProps): JSX.Element {
    return (
        <LayerDividerWrapper $position={position}>
            <LayerAddArea $viewOnly={viewOnly} data-testid="divider-button" onClick={onClick} />

            <DividerButton>
                <Plus />
            </DividerButton>
            <LayerBorder />
        </LayerDividerWrapper>
    );
}

export default LayerDivider;
