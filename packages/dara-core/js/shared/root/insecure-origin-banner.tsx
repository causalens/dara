import { transparentize } from 'polished';

import styled from '@darajs/styled-components';

import { getAuthOriginRecommendation, shouldWarnAboutInsecureAuthOrigin } from '@/auth/origin-security';

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

    const recommendedOrigin = getAuthOriginRecommendation(window.location);

    return (
        <Banner role="alert">
            This app is running on <InlineCode>{window.location.origin}</InlineCode> which may prevent core Dara
            features from working reliably. Open it at <InlineCode>{recommendedOrigin}</InlineCode>.
        </Banner>
    );
}

export default InsecureOriginBanner;
