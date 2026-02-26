import { transparentize } from 'polished';
import { createPortal } from 'react-dom';

import styled from '@darajs/styled-components';

import { getAuthOriginRecommendation, shouldWarnAboutInsecureAuthOrigin } from '@/auth/origin-security';

const Banner = styled.div`
    position: fixed;
    z-index: 2147483647;
    top: 0;
    right: 0;
    left: 0;

    box-sizing: border-box;
    width: 100%;
    padding: 0.75rem 1rem;

    font-size: 0.875rem;
    line-height: 1.4;
    color: ${(props) => props.theme.colors.error};
    text-align: center;
    letter-spacing: 0.01em;

    background-color: ${(props) => transparentize(0.9, props.theme.colors.error)};
    border-bottom: 1px solid ${(props) => transparentize(0.7, props.theme.colors.error)};
`;

const InlineCode = styled.code`
    font-family: monospace;
    font-size: inherit;
    word-break: break-word;
    overflow-wrap: anywhere;
`;

const RecommendationLink = styled.a`
    color: inherit;
`;

function InsecureOriginBanner(): JSX.Element | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return null;
    }

    if (!shouldWarnAboutInsecureAuthOrigin(window.location)) {
        return null;
    }

    const recommendedOrigin = getAuthOriginRecommendation(window.location);

    return createPortal(
        <Banner role="alert">
            This app is running on <InlineCode>{window.location.origin}</InlineCode> which may prevent core Dara
            features from working reliably. Open it at{' '}
            <RecommendationLink href={recommendedOrigin}>
                <InlineCode>{recommendedOrigin}</InlineCode>
            </RecommendationLink>
            .
        </Banner>,
        document.body
    );
}

export default InsecureOriginBanner;
