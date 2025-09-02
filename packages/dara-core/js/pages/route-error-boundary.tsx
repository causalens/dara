import { useRef } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import styled from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import { useConfig } from '@/shared';
import { type Config, LoaderError } from '@/types';

import ErrorStatusCodePage, { errorMessages } from './error-status-code-page';

const CenteredDivWithGap = styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2rem;

    min-width: 0;
    margin: auto;
    padding: 0.5rem;

    text-align: center;

    code {
        padding: 0.2rem;
        background-color: ${(props) => props.theme.colors.grey2};
        border-radius: 0.5rem;
    }
`;

const Title = styled.h1`
    margin: 0;
    font-weight: 500;
`;

const ErrorMessage = styled.p`
    font-size: 0.875rem;
    line-height: 1.5;
`;

const ErrorStack = styled.pre`
    overflow-x: auto;
    display: flex;
    flex-shrink: 1;

    min-width: 0;

    font-size: 0.825rem;
    text-align: left;
`;

const ButtonBar = styled.div`
    display: flex;
    justify-content: center;

    button {
        width: fit-content;
    }
`;

function isProductionBuild(config: Config): boolean {
    return config.build_mode === 'PRODUCTION' && !config.build_dev;
}

function RouteErrorBoundary(): React.ReactNode {
    const error = useRouteError();
    const config = useConfig();

    const firstRender = useRef(true);
    if (firstRender.current) {
        // eslint-disable-next-line no-console
        console.error(error);
        firstRender.current = false;
    }

    // explicit errors from loaders
    if (isRouteErrorResponse(error)) {
        // show a regular error page when the error code is known
        if (String(error.status) in errorMessages) {
            return <ErrorStatusCodePage code={String(error.status)} />;
        }

        return (
            <CenteredDivWithGap>
                <Title>
                    {error.status} {error.statusText}
                </Title>
                <ErrorMessage>Try again or contact the application owner</ErrorMessage>
                <ButtonBar>
                    <Button href="/login" styling="error">
                        Go to home
                    </Button>
                </ButtonBar>
            </CenteredDivWithGap>
        );
    }

    // in prod, always show the error page
    if (isProductionBuild(config)) {
        return (
            <CenteredDivWithGap>
                <Title>Unexpected error occurred</Title>
                <ErrorMessage>Try again or contact the application owner</ErrorMessage>
                <ButtonBar>
                    <Button href="/login" styling="error">
                        Go to home
                    </Button>
                </ButtonBar>
            </CenteredDivWithGap>
        );
    }

    // Otherwise, show the actual error to the user (developer mode)
    if (error instanceof LoaderError) {
        // Explicitly handle loader errors
        return (
            <CenteredDivWithGap>
                <Title>
                    Error loading page <code>{error.payload.path}</code>
                </Title>
                <ErrorMessage>
                    Error was thrown by action <code>{error.payload.action_name}</code>. <br />
                    To ensure security and integrity of the page content, errors raised within <code>on_load</code>{' '}
                    actions trigger this error boundary page rather than only showing a notification. For best user
                    experience, gracefully handle any exceptions raised within those actions.
                </ErrorMessage>
                <ErrorStack>{error.payload.stacktrace}</ErrorStack>
                <ButtonBar>
                    <Button href="/login" styling="error">
                        Go to home
                    </Button>
                </ButtonBar>
            </CenteredDivWithGap>
        );
    }

    return (
        <CenteredDivWithGap>
            <Title>Unknown error occurred</Title>
            <ErrorStack>{String(error)}</ErrorStack>
            <ButtonBar>
                <Button href="/login" styling="error">
                    Go to home
                </Button>
            </ButtonBar>
        </CenteredDivWithGap>
    );
}

export default RouteErrorBoundary;
