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
import Highlight, { Language, PrismTheme, defaultProps } from 'prism-react-renderer';
import nightOwlLight from 'prism-react-renderer/themes/nightOwlLight';
import vsDark from 'prism-react-renderer/themes/vsDark';
import { useEffect, useState } from 'react';

import styled, { darkTheme, theme, useTheme } from '@darajs/styled-components';
import { Check, Copy } from '@darajs/ui-icons';
import { copyToClipboard } from '@darajs/ui-utils';

import { InteractiveComponentProps } from '../types';

const IconLabel = styled.span`
    position: absolute;
    color: ${(props) => props.theme.colors.grey4};

    top: 1rem;
    right: 1rem;

    :hover {
        color: ${(props) => props.theme.colors.grey5};
    }

    :active {
        color: ${(props) => props.theme.colors.grey6};
    }
`;

export enum CodeComponentThemes {
    DARK = 'dark',
    LIGHT = 'light',
}

export interface CodeViewerProps extends InteractiveComponentProps<string> {
    /** the language the code string is written in */
    language: Language;
    /** The code theme to display */
    codeTheme?: CodeComponentThemes;
}

interface StyledPreProps {
    isLightTheme?: boolean;
}

const StyledPre = styled.pre<StyledPreProps>`
    min-width: fit-content;
    margin: 0;
    padding: 1rem;

    background-color: ${(props) => (props.isLightTheme ? theme.colors.blue1 : darkTheme.colors.blue1)} !important;
    border-radius: 0.25rem;
`;

function CodeViewer(props: CodeViewerProps): JSX.Element {
    const themeCtx = useTheme();
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (isCopied) {
            const timer = setTimeout(() => {
                setIsCopied(false);
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [isCopied]);

    async function copyCodeToClipboard(code: string) {
        const success = await copyToClipboard(code);

        if (success) {
            setIsCopied(true);
        } else {
            setIsCopied(false);
        }
    }

    function getTheme(): PrismTheme {
        if (props.codeTheme) {
            if (props.codeTheme === CodeComponentThemes.LIGHT) {
                return nightOwlLight;
            }
            return vsDark;
        }
        if (themeCtx.themeType === 'dark') {
            return vsDark;
        }
        return nightOwlLight;
    }

    return (
        <Highlight {...defaultProps} code={props.value} language={props.language} theme={getTheme()}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <>
                    {isCopied ?
                        <IconLabel>
                            <Check /> Copied!
                        </IconLabel>
                    :   <IconLabel
                            style={{ cursor: 'pointer' }}
                            onClick={() => copyCodeToClipboard(props.value)}
                            role="button"
                        >
                            <Copy /> Copy code
                        </IconLabel>
                    }
                    <StyledPre
                        className={className}
                        isLightTheme={props.codeTheme !== 'dark'}
                        style={{
                            ...style,
                        }}
                    >
                        {tokens.map((line, i) => (
                            <div {...getLineProps({ key: i, line })} key={i}>
                                {line.map((token, key) => (
                                    <code {...getTokenProps({ key, token })} key={key} />
                                ))}
                            </div>
                        ))}
                    </StyledPre>
                </>
            )}
        </Highlight>
    );
}

export default CodeViewer;
