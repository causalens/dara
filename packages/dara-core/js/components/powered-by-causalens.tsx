import styled, { useTheme } from '@darajs/styled-components';

import CausalensDark from '@/assets/causalens-dark.svg';
import CausalensLight from '@/assets/causalens-light.svg';

const BuiltWithLink = styled.a`
    display: flex;
    gap: 0.2rem;
    align-items: center;

    font-size: 0.75rem;
    color: inherit;
    text-decoration: none;

    :hover {
        text-decoration: underline;
    }
`;

function PoweredByCausalens(): JSX.Element {
    const theme = useTheme();
    const causalensLogoSrc = theme.themeType === 'dark' ? CausalensDark : CausalensLight;
    const causalensLogo = <img alt="causaLens Logo" src={causalensLogoSrc} />;

    return (
        <BuiltWithLink
            href="https://causalens.com/?utm_source=dara&utm_medium=direct&utm_campaign=dara_platform"
            target="_blank"
            rel="noopener"
        >
            <span style={{ marginTop: '0.4375rem' }}>Powered by</span> {causalensLogo}
        </BuiltWithLink>
    );
}

export default PoweredByCausalens;
