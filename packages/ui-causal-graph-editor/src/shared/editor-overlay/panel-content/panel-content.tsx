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

import { PanelDiv } from '../positional-divs';
import { PanelTitle } from './panel-title';

interface PanelContentProps {
    children: React.ReactNode;
    /** Handler to remove currently selected edge; if not provided delete button should not be shown */
    onDelete?: () => void | Promise<void>;
    onMouseEnter?: () => void | Promise<void>;
    onMouseLeave?: () => void | Promise<void>;
    /** Function to select the next edge/node */
    onNext: () => void | Promise<void>;
    /** Function to select the previous edge/node */
    onPrev: () => void | Promise<void>;
    /** Panel title */
    title: string;
}

function PanelContent(props: PanelContentProps): JSX.Element {
    const { disablePointerEvents } = useContext(PointerContext);

    return (
        <PanelDiv $hide={disablePointerEvents} onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave}>
            <PanelTitle onDelete={props.onDelete} onNext={props.onNext} onPrev={props.onPrev} title={props.title} />
            {props.children}
        </PanelDiv>
    );
}

export default PanelContent;
