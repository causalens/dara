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
import styled, { theme } from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';
import { ArrowLeft, ArrowRight, TrashAlt } from '@darajs/ui-icons';

const TitleWrapper = styled.div`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    width: 100%;
`;

const Title = styled.h3`
    justify-self: center;

    margin: 0;
    padding: 0;

    font-weight: 400;
    color: ${(props) => props.theme.colors.text};
`;

const SmallButton = styled(Button)`
    width: 28px;
    min-width: 0;
    height: 28px;
    padding: 0 0.25rem;
`;

export interface PanelTitleProps {
    /** Action to perform on press of the delete button */
    onDelete?: () => void | Promise<void>;
    /** Action to perform on press of the next button */
    onNext?: () => void | Promise<void>;
    /** Action to perform on press of the previous button */
    onPrev?: () => void | Promise<void>;
    /** Title for the panel */
    title: string;
}

export function PanelTitle(props: PanelTitleProps): JSX.Element {
    return (
        <TitleWrapper>
            <div style={{ display: 'flex', justifySelf: 'left' }}>
                {props.onPrev && (
                    <SmallButton aria-label="Previous" onClick={props.onPrev} styling="ghost">
                        <ArrowLeft />
                    </SmallButton>
                )}
                {props.onNext && (
                    <SmallButton aria-label="Next" onClick={props.onNext} styling="ghost">
                        <ArrowRight />
                    </SmallButton>
                )}
            </div>
            <Title>{props.title}</Title>
            {props.onDelete && (
                <SmallButton
                    aria-label="Delete"
                    onClick={props.onDelete}
                    style={{
                        color: theme.colors.error,
                        justifySelf: 'right',
                    }}
                    styling="ghost"
                >
                    <TrashAlt />
                </SmallButton>
            )}
        </TitleWrapper>
    );
}
