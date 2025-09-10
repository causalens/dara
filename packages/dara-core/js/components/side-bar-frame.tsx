import { transparentize } from 'polished';

import styled, { useTheme } from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import DaraDark from '@/assets/dara-dark.svg';
import DaraLight from '@/assets/dara-light.svg';
import { DirectionCtx, DynamicComponent, Wrapper, getIcon, useConfig } from '@/shared';
import { type ComponentInstance } from '@/types';
import { prependBaseUrl } from '@/utils';

import PoweredByCausalens from './powered-by-causalens';

interface SideBarProps {
    width?: string;
}

const shouldForwardProp = (prop: any): boolean => !['width'].includes(prop);

const SideBar = styled.div.withConfig({ shouldForwardProp })<SideBarProps>`
    display: flex;
    flex-direction: column;
    align-items: center;

    width: ${(props) => props.width || '240px'};
    min-width: 150px;
    max-width: 350px;
    height: 100%;
    padding: 2rem 1rem 1.5rem;

    color: ${(props) => props.theme.colors.secondary};

    background: ${(props) => {
        return `radial-gradient(circle closest-corner at 10% 50%, ${transparentize(
            0.4,
            props.theme.colors.background
        )} 0%, ${transparentize(
            0.9,
            props.theme.colors.blue4
        )} 100%),radial-gradient(circle closest-corner at 5% 10%, ${transparentize(
            0.8,
            props.theme.colors.error
        )} 0%, ${transparentize(
            0.9,
            props.theme.colors.blue4
        )} 230%),radial-gradient(circle closest-corner at 50% 100%, ${transparentize(
            0.8,
            props.theme.colors.success
        )} 200%, ${transparentize(0.2, props.theme.colors.blue4)} 610%)`;
    }};
    box-shadow:
        rgb(20 20 25 / 15%) 0 4px 16px,
        rgb(20 20 25 / 15%) 0 8px 32px;
`;

const LogoutButton = styled(Button)`
    width: 80%;
    margin-bottom: 1.5rem;
    padding: 1rem;
    border-radius: 1rem;

    a {
        color: ${(props) => props.theme.colors.blue1};
        text-decoration: none;
    }

    svg {
        cursor: pointer;
        margin-right: 1rem;
        color: ${(props) => props.theme.colors.blue1};
    }
`;

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

interface LogoProps {
    width?: string;
}

const LogoImage = styled.img<LogoProps>`
    width: ${(props) => props.width};
    max-width: 200px;
    margin: 1rem 0 2rem;
`;

interface SideBarFrameProps {
    content: ComponentInstance;
    hide_logo?: boolean;
    logo_path?: string;
    logo_position: 'top' | 'bottom';
    logo_width?: string;
    side_bar: ComponentInstance;
    side_bar_padding?: string;
    side_bar_position?: 'left' | 'right';
    side_bar_width?: string;
    powered_by_causalens?: boolean;
}

const LogoutArrow = getIcon('fa-solid fa-arrow-right-from-bracket');

/**
 * The SideBarFrame component is designed as a root component for an app built using the Dara core framework. It adds
 * a dark blue side bar to the left of the screen and displays a main content on a light grey background in the center
 *
 * It exposes two slots for registering content: side-bar & content
 */
function SideBarFrame(props: SideBarFrameProps): JSX.Element {
    const theme = useTheme();
    const config = useConfig();
    const logo = props.logo_path && (
        <LogoImage alt="Logo" src={prependBaseUrl(props.logo_path)} width={props.logo_width} />
    );
    const logoSrc = theme.themeType === 'dark' ? DaraDark : DaraLight;
    const daraLogo = <img alt="Dara Logo" src={logoSrc} />;

    const showPoweredBy = props.powered_by_causalens ?? config.powered_by_causalens;

    return (
        <Wrapper backgroundColor={theme.colors.background}>
            {props.side_bar_position === 'right' && (
                <Wrapper>{props.content && <DynamicComponent component={props.content} />}</Wrapper>
            )}
            <SideBar style={{ padding: props.side_bar_padding }} width={props.side_bar_width}>
                {!props.hide_logo && props.logo_position !== 'bottom' && logo}
                <Wrapper direction="column">
                    <DirectionCtx.Provider value={{ direction: 'column' }}>
                        {props.side_bar && <DynamicComponent component={props.side_bar} />}
                    </DirectionCtx.Provider>
                </Wrapper>
                {!props.hide_logo && props.logo_position === 'bottom' && logo}
                <LogoutButton href="/logout" styling="error">
                    <LogoutArrow style={{ marginRight: '0.5rem' }} />
                    Logout
                </LogoutButton>
                <BuiltWithLink href="https://github.com/causalens/dara" target="_blank" rel="noopener noreferrer">
                    Built with {daraLogo}
                </BuiltWithLink>
                {showPoweredBy && <PoweredByCausalens />}
            </SideBar>
            {props.side_bar_position !== 'right' && (
                <Wrapper style={{ padding: '2rem 3rem' }}>
                    {props.content && <DynamicComponent component={props.content} />}
                </Wrapper>
            )}
        </Wrapper>
    );
}

export default SideBarFrame;
