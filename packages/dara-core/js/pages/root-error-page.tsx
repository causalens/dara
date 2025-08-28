import { isRouteErrorResponse, useRouteError } from 'react-router';

import styled from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import Center from '@/shared/center/center';

import ErrorPage, { errorMessages } from './error-page';

const CenteredDivWithGap = styled(Center)`
    gap: 1rem;
    margin: 10px;
    text-align: center;
`;

function RootErrorPage(): React.ReactNode {
    const error = useRouteError();

    // errors from loaders - can happen normally
    if (isRouteErrorResponse(error)) {
        // show a regular error page when the error code is known
        if (String(error.status) in errorMessages) {
            return <ErrorPage code={String(error.status)} />;
        }

        <CenteredDivWithGap>
            <h1>
                {error.status} {error.statusText}
            </h1>
            <p>Try again or contact the application owner</p>
            <Button href="/login" styling="error">
                Go to home
            </Button>
        </CenteredDivWithGap>;
    }

    console.error(error);

    // some error thrown, show the actual error
    if (error instanceof Error) {
        <CenteredDivWithGap>
            <h1>{error.message}</h1>
            <pre>{error.stack}</pre>
            <Button href="/login" styling="error">
                Go to home
            </Button>
        </CenteredDivWithGap>;
    }

    return (
        <CenteredDivWithGap>
            <h1>Unexpected error occurred</h1>
            <pre>{String(error)}</pre>
            <Button href="/login" styling="error">
                Go to home
            </Button>
        </CenteredDivWithGap>
    );
}

export default RootErrorPage;
