import { transparentize } from 'polished';
import { FallbackProps } from 'react-error-boundary';

import styled from '@darajs/styled-components';

import { injectCss, parseRawCss } from '@/shared/utils';
import { ErrorHandlingConfig } from '@/types/core';

const StyledErrorDisplay = styled.div`
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;

    height: min-content;
    padding: 1rem;

    background-color: ${(props) => transparentize(0.9, props.theme.colors.error)};
    border-radius: 0.25rem;
`;
const ErrorDisplayWrapper = injectCss(StyledErrorDisplay);

const IconWrapper = styled.div`
    display: flex;
    height: 100%;
`;

const ErrorIcon = styled.i`
    line-height: 21px;
    color: ${(props) => props.theme.colors.error};
`;

const ContentWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
`;

const ErrorContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: ${(props) => props.theme.colors.error};
`;

const ErrorTitle = styled.h3`
    display: flex;
    gap: 0.375rem;

    font-size: 1rem;
    font-weight: bold;
    line-height: 1.375rem;
    color: ${(props) => props.theme.colors.error};
`;

const ErrorText = styled.span`
    font-size: 1rem;
    line-height: 1.375rem;
`;

const RetryButton = styled.button`
    cursor: pointer;

    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;

    width: 40px;
    height: 40px;

    color: ${(props) => props.theme.colors.error};

    background-color: inherit;
    border: none;
    border: 1px solid;
    border-color: ${(props) => props.theme.colors.error};
    border-radius: 5px;

    transition-timing-function: ease;
    transition-duration: 100ms;
    transition-property: color, border-color;

    i {
        line-height: 21px;
        transition: transform 400ms ease-in-out;
    }

    &:hover {
        color: ${(props) => props.theme.colors.errorHover};
        border-color: ${(props) => props.theme.colors.errorHover};

        i {
            transform: rotate(180deg);
        }
    }
`;

interface ErrorDisplayProps extends Partial<FallbackProps> {
    config?: ErrorHandlingConfig;
}

function ErrorDisplay(props: ErrorDisplayProps): JSX.Element {
    const [styles, css] = parseRawCss(props.config?.raw_css);

    return (
        <ErrorDisplayWrapper $rawCss={css} style={styles}>
            <ContentWrapper>
                <ErrorContent>
                    <ErrorTitle>
                        <IconWrapper>
                            <ErrorIcon aria-hidden className="fa-solid fa-circle-xmark fa-lg" />
                        </IconWrapper>
                        {props?.config?.title ?? 'Error'}
                    </ErrorTitle>
                    <ErrorText>{props?.config?.description ?? 'Try again or contact the application owner.'}</ErrorText>
                </ErrorContent>
            </ContentWrapper>
            {props.resetErrorBoundary && (
                <RetryButton onClick={() => props.resetErrorBoundary(props.error)} type="button">
                    <i aria-hidden className="fa-solid fa-rotate fa-xl" />
                </RetryButton>
            )}
        </ErrorDisplayWrapper>
    );
}

export default ErrorDisplay;
