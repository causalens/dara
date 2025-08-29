import { type ComponentProps, useMemo } from 'react';
import { useLocation } from 'react-router';

import styled from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import Center from '@/shared/center/center';

const CenteredDivWithGap = styled(Center)`
    gap: 1rem;
    margin: 10px;
    text-align: center;
`;

interface ErrorConfig {
    description: string;
    styling: ComponentProps<typeof Button>['styling'];
    title: string;
}

const config401 = {
    description: 'Your login session may have expired. Try again.',
    styling: 'primary',
    title: 'We were not able to authenticate you',
} satisfies ErrorConfig;

export const errorMessages: Record<string, ErrorConfig> = {
    '403': {
        description:
            'You are not authorised to access this application. Please contact the application owner to enable access.',
        styling: 'error',
        title: 'We were not able to authenticate you',
    },
    '404': {
        description: 'The requested page could not be found.',
        styling: 'error',
        title: 'Page not found',
    },
    '401': config401,
    default: config401,
};

function ErrorPage(props: { code?: string }): JSX.Element {
    const { search } = useLocation();

    const query = useMemo(() => new URLSearchParams(search), [search]);

    const code = props.code ?? query.get('code');

    const errorConfig = (code && errorMessages[code]) || errorMessages.default!;

    return (
        <CenteredDivWithGap>
            <h1>{errorConfig.title}</h1>
            <p>{errorConfig.description}</p>
            <Button href="/login" styling={errorConfig.styling}>
                Retry
            </Button>
        </CenteredDivWithGap>
    );
}

export default ErrorPage;
