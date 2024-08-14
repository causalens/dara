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
import Highlight, { Language, defaultProps } from 'prism-react-renderer';
import nightOwlLight from 'prism-react-renderer/themes/nightOwlLight';
import vsDark from 'prism-react-renderer/themes/vsDark';
import { useEffect, useMemo, useState } from 'react';

import styled, { darkTheme, theme, useTheme } from '@darajs/styled-components';
import { Check, Copy } from '@darajs/ui-icons';
import { copyToClipboard } from '@darajs/ui-utils';

import { InteractiveComponentProps } from '../types';

const CodeViewerContainer = styled.div`
    display: flex;
    flex: 1 1 100%;
    flex-direction: column;
    color: ${(props) => props.theme.colors.grey4};
`;

const TopBar = styled.div<{ $isLightTheme?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding: 0.5rem 1rem;

    font-size: 0.875rem;

    background-color: ${(props) => (props.$isLightTheme ? theme.colors.blue2 : darkTheme.colors.blue2)} !important;
    border-radius: 0.25rem 0.25rem 0 0;
`;

const CopyToClipboardContainer = styled.span`
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

const StyledPre = styled.pre<{ $isLightTheme?: boolean }>`
    margin: 0;
    overflow-x: auto;
    padding: 1rem;

    background-color: ${(props) => (props.$isLightTheme ? theme.colors.blue1 : darkTheme.colors.blue1)} !important;
    border-radius: 0 0 0.25rem 0.25rem;
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

    async function copyCodeToClipboard(code: string): Promise<void> {
        const success = await copyToClipboard(code);

        if (success) {
            setIsCopied(true);
        } else {
            setIsCopied(false);
        }
    }

    const viewerTheme = useMemo(() => {
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
    }, [props.codeTheme, themeCtx.themeType]);

    return (
        <CodeViewerContainer
            style={{
                ...props.style,
            }}
            className={props.className}
        >
            <TopBar $isLightTheme={props.codeTheme !== 'dark'}>
                <span>{props.language}</span>
                {isCopied ?
                    <CopyToClipboardContainer>
                        <Check /> Copied!
                    </CopyToClipboardContainer>
                    : <CopyToClipboardContainer
                        style={{ cursor: 'pointer' }}
                        onClick={() => copyCodeToClipboard(props.value)}
                        role="button"
                    >
                        <Copy /> Copy code
                    </CopyToClipboardContainer>
                }
            </TopBar>
            <Highlight {...defaultProps} code={props.value} language={props.language} theme={viewerTheme}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                    <StyledPre
                        className={className}
                        $isLightTheme={props.codeTheme !== 'dark'}
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
                )}
            </Highlight>
        </CodeViewerContainer>
    );
}

export default CodeViewer;
