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

interface PositionDivProps {
    padding: string;
}

const applyPadding = (props: PositionDivProps): string => props.padding;

const OverlayDiv = styled.div`
    position: absolute;
    z-index: 1;

    display: flex;
    flex-direction: row;
    gap: 0.6rem;
    justify-content: space-between;

    opacity: 0;

    transition: opacity 0.2s ease-in-out;

    :focus-within,
    &.show {
        opacity: 1;
    }
`;

export const BottomDiv = styled(OverlayDiv)<{ padding: string }>`
    pointer-events: none;
    right: ${applyPadding};
    bottom: ${applyPadding};
    left: ${applyPadding};
`;

export const TopDiv = styled(OverlayDiv)<{ padding: string }>`
    pointer-events: none;

    top: ${applyPadding};
    right: ${applyPadding};
    left: ${applyPadding};

    gap: 1.5rem;
`;

const CornerDiv = styled.div`
    display: flex;
    flex-flow: row wrap;
    gap: 0.6rem;
`;

export const TopRightDiv = styled(CornerDiv)`
    z-index: 5;

    overflow-x: hidden;
    align-items: flex-start;
    justify-content: start;

    padding-bottom: 0.5rem;
`;
export const TopLeftDiv = styled(CornerDiv)`
    z-index: 5;
    align-items: flex-start;
    justify-content: end;
`;
export const TopCenterDiv = styled(CornerDiv)`
    z-index: 5;

    flex-shrink: 1;
    align-items: flex-start;
    justify-content: center;

    /* Allow the center to shrink */
    min-width: 0;
`;
export const BottomRightDiv = styled(CornerDiv)`
    z-index: 5;
    align-items: flex-end;
    justify-content: start;
`;
export const BottomLeftDiv = styled(CornerDiv)`
    z-index: 5;
    align-items: flex-end;
    justify-content: end;
`;

export const PanelDiv = styled.div<{ $hide?: boolean }>`
    pointer-events: ${(props) => (props.$hide ? 'none' : 'auto')};
    cursor: default;

    position: absolute;
    z-index: 5;
    top: 70px;
    right: 10px;

    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 1.5rem;
    align-items: center;
    justify-content: space-between;

    width: 23rem;
    max-width: calc(100% - 20px);
    max-height: calc(100% * 0.85);
    padding: 1.5rem;

    opacity: ${(props) => (props.$hide ? 0 : 1)};
    background-color: ${(props) => props.theme.colors.grey1};
    border-radius: 4px;
    box-shadow: ${(props) => props.theme.shadow.light};

    transition: opacity 0.2s ease-in-out;

    @media (width <= 576px) {
        inset: 10px;
        width: 100%;
        max-height: calc(100% - 20px);
    }
`;
