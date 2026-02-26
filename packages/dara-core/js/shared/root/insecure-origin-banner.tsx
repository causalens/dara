import { transparentize } from 'polished';

import styled from '@darajs/styled-components';

import { shouldWarnAboutInsecureAuthOrigin } from '@/auth/origin-security';

const Banner = styled.div`
    padding: 0.75rem 1rem;

    color: ${(props) => props.theme.colors.error};
    text-align: center;
    letter-spacing: 0.01em;

    background-color: ${(props) => transparentize(0.9, props.theme.colors.error)};
    border-bottom: 1px solid ${(props) => transparentize(0.7, props.theme.colors.error)};
`;

const InlineCode = styled.code`
    font-family: monospace;
    font-size: 0.875em;
`;

function InsecureOriginBanner(): JSX.Element | null {
    if (typeof window === 'undefined') {
        return null;
    }

    if (!shouldWarnAboutInsecureAuthOrigin(window.location)) {
        return null;
    }

    return (
        <Banner role="alert">
            Authentication cookies are marked <InlineCode>Secure</InlineCode> and may be blocked on{' '}
            <InlineCode>{window.location.origin}</InlineCode>. Use <InlineCode>https://...</InlineCode> or{' '}
            <InlineCode>http://localhost:...</InlineCode> for local development.
        </Banner>
    );
}

export default InsecureOriginBanner;

