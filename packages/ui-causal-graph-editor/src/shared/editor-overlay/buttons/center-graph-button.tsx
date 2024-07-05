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

import { useTheme } from '@darajs/styled-components';
import { Tooltip } from '@darajs/ui-components';

import PointerContext from '../../pointer-context';
import { FloatingButton } from '../floating-elements';

interface CenterGraphButtonProps {
    /** Handler for resetting the zoom */
    onResetZoom: () => void | Promise<void>;
}

function CenterGraphButton(props: CenterGraphButtonProps): JSX.Element {
    const { disablePointerEvents } = useContext(PointerContext);
    const theme = useTheme();

    return (
        <Tooltip content="Center Graph" placement="bottom">
            <FloatingButton
                aria-label="Center Graph"
                disableEvents={disablePointerEvents}
                fixedSize
                onClick={props.onResetZoom}
                style={{ padding: '0 0.75rem' }}
            >
                <svg
                    fill="none"
                    stroke={theme.colors.grey4}
                    strokeWidth={2}
                    style={{
                        height: '100%',
                        width: '100%',
                    }}
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </FloatingButton>
        </Tooltip>
    );
}

export default CenterGraphButton;
