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
import { useContext, useRef, useState } from 'react';

import styled from '@darajs/styled-components';
import { Button, Tooltip } from '@darajs/ui-components';
import { Cross, List } from '@darajs/ui-icons';
import { useOnClickOutside } from '@darajs/ui-utils';

import PointerContext from '@shared/pointer-context';

import { FloatingButton } from '../floating-elements';
import { LegendList, LegendListProps } from './legend-list';

const LegendWrapper = styled.div`
    position: relative;
    z-index: 1;
    bottom: 0;
    left: 0;
    transform-origin: bottom left;

    overflow: hidden;
    display: flex;
    gap: 2rem;

    padding: 1.5rem;

    background-color: ${({ theme }) => theme.colors.background};
    border-radius: 4px;
    box-shadow: ${({ theme }) => theme.shadow.light};

    transition:
        opacity 0.3s,
        transform 0.3s;
`;

const LegendOpenButton = styled(FloatingButton)`
    position: absolute;
    z-index: 2;
    bottom: 0;
    left: 0;

    transition: opacity 0.3s;
`;

export interface LegendProps {
    listItems: LegendListProps['listItems'];
}

function Legend(props: LegendProps): JSX.Element {
    const [showLegend, setShowLegend] = useState(false);
    const { disablePointerEvents } = useContext(PointerContext);

    const panelRef = useRef<HTMLDivElement>(null);
    useOnClickOutside(panelRef.current, () => setShowLegend(false));

    if (!props.listItems || props.listItems.length === 0) {
        return null;
    }

    return (
        <div style={{ position: 'relative' }}>
            <Tooltip content="Legend" placement="top">
                <LegendOpenButton
                    fixedSize
                    onClick={() => setShowLegend(true)}
                    style={{
                        opacity: showLegend ? 0 : 1,
                        pointerEvents: showLegend || disablePointerEvents ? 'none' : 'all',
                    }}
                >
                    <List />
                </LegendOpenButton>
            </Tooltip>
            <LegendWrapper
                ref={panelRef}
                style={{
                    minWidth: '13rem',
                    opacity: showLegend ? 1 : 0,
                    pointerEvents: !showLegend || disablePointerEvents ? 'none' : 'all',
                    transform: showLegend ? 'scale(1)' : 'scale(0)',
                }}
            >
                <Button
                    style={{
                        height: '12px',
                        margin: 0,
                        minWidth: 0,
                        padding: 0,
                        position: 'absolute',
                        right: '1rem',
                        top: '1rem',
                        width: '12px',
                    }}
                    styling="ghost"
                >
                    <Cross onClick={() => setShowLegend(false)} />
                </Button>
                <LegendList listItems={props.listItems} />
            </LegendWrapper>
        </div>
    );
}

export default Legend;
