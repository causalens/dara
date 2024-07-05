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

const Wrapper = styled.div`
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: center;

    height: 100%;
`;

interface LoadingTextProps {
    color?: string;
}

const LoadingText = styled.span<LoadingTextProps>`
    font-size: 1.2rem;
    color: ${(props) => props.color ?? props.theme.colors.grey4};
`;

interface LoaderProps {
    color?: string;
    size?: string;
}

const Loader = styled.span<LoaderProps>`
    position: relative;
    width: ${(props) => props.size ?? '2.5rem'};
    height: ${(props) => props.size ?? '2.5rem'};
    animation: sk-chase 2.5s infinite linear both;

    .sk-chase-dot {
        position: absolute;
        top: 0;
        left: 0;

        width: 100%;
        height: 100%;

        animation: sk-chase-dot 2s infinite ease-in-out both;
    }

    .sk-chase-dot::before {
        content: '';

        display: block;

        width: 25%;
        height: 25%;

        background-color: ${(props) => props.color ?? props.theme.colors.grey4};
        border-radius: 100%;

        animation: sk-chase-dot-before 2s infinite ease-in-out both;
    }

    .sk-chase-dot:nth-child(1) {
        animation-delay: -1.1s;
    }

    .sk-chase-dot:nth-child(2) {
        animation-delay: -1s;
    }

    .sk-chase-dot:nth-child(3) {
        animation-delay: -0.9s;
    }

    .sk-chase-dot:nth-child(4) {
        animation-delay: -0.8s;
    }

    .sk-chase-dot:nth-child(5) {
        animation-delay: -0.7s;
    }

    .sk-chase-dot:nth-child(6) {
        animation-delay: -0.6s;
    }

    .sk-chase-dot:nth-child(1)::before {
        animation-delay: -1.1s;
    }

    .sk-chase-dot:nth-child(2)::before {
        animation-delay: -1s;
    }

    .sk-chase-dot:nth-child(3)::before {
        animation-delay: -0.9s;
    }

    .sk-chase-dot:nth-child(4)::before {
        animation-delay: -0.8s;
    }

    .sk-chase-dot:nth-child(5)::before {
        animation-delay: -0.7s;
    }

    .sk-chase-dot:nth-child(6)::before {
        animation-delay: -0.6s;
    }

    @keyframes sk-chase {
        100% {
            transform: rotate(360deg);
        }
    }

    @keyframes sk-chase-dot {
        80%,
        100% {
            transform: rotate(360deg);
        }
    }

    @keyframes sk-chase-dot-before {
        50% {
            transform: scale(0.4);
        }

        100%,
        0% {
            transform: scale(1);
        }
    }
`;

export interface SpinnerProps {
    /** Standard class prop */
    className?: string;
    /* defines the color of the spinner and text */
    color?: string;
    /* sets whether the LOADING text should show */
    showText?: boolean;
    /* defines size of the spinner */
    size?: string;
    /** style prop */
    style?: React.CSSProperties;
    /** custom text to show in place of Loading */
    text?: string;
}

/**
 * A simple spinner component, that can be used to denote something as loading
 *
 * @param props any prop that could be passed to a div can be passed here
 */
function Spinner(props: SpinnerProps): JSX.Element {
    return (
        <Wrapper className={props.className} style={props.style}>
            <Loader color={props.color} size={props.size}>
                <div className="sk-chase-dot" />
                <div className="sk-chase-dot" />
                <div className="sk-chase-dot" />
                <div className="sk-chase-dot" />
                <div className="sk-chase-dot" />
                <div className="sk-chase-dot" />
            </Loader>
            {(props.showText || props.text) && <LoadingText color={props.color}>{props.text ?? 'LOADING'}</LoadingText>}
        </Wrapper>
    );
}

export default Spinner;
