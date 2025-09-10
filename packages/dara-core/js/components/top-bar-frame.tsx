import { transparentize } from 'polished';

import styled, { useTheme } from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import DaraDark from '@/assets/dara-dark.svg';
import DaraLight from '@/assets/dara-light.svg';
import { DirectionCtx, DynamicComponent, Wrapper, getIcon } from '@/shared';
import { type ComponentInstance } from '@/types';
import { prependBaseUrl } from '@/utils';

interface TopBarProps {
    height?: string;
}

const shouldForwardProp = (prop: any): boolean => !['width'].includes(prop);

const TopBar = styled.div.withConfig({ shouldForwardProp })<TopBarProps>`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-end;

    width: 100%;
    height: ${(props) => props.height || '124px'};
    min-height: 100px;
    max-height: 350px;
    padding: 2rem 3rem;

    color: ${(props) => props.theme.colors.secondary};

    background: ${(props) => {
        return `
        radial-gradient(farthest-side at 50% 0%, ${transparentize(
            0.7,
            props.theme.colors.background
        )} 0%, ${transparentize(0.9, props.theme.colors.blue4)} 50%),
        radial-gradient(at -50% 90%, ${transparentize(0.5, props.theme.colors.error)} 0%, ${transparentize(
            0.7,
            props.theme.colors.blue4
        )} 45%),
        radial-gradient(at 130% 100%, ${transparentize(0.4, props.theme.colors.success)} 0%, ${transparentize(
            0.5,
            props.theme.colors.blue4
        )} 50%)`;
    }};
    box-shadow:
        rgb(20 20 25 / 15%) 0 4px 16px,
        rgb(20 20 25 / 15%) 0 8px 32px;
`;

const TopBarContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

const LogoutButton = styled(Button)`
    width: 7rem;
    height: 3rem;
    margin-left: 0.5rem;
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

const RouteButtons = styled(Wrapper)`
    gap: 0.5rem;
    align-items: center;
`;

const BuiltWithSpan = styled.span`
    display: flex;
    gap: 0.2rem;
    align-items: center;
    font-size: 0.75rem;
`;

interface LogoProps {
    width?: string;
}

const LogoImage = styled.img<LogoProps>`
    width: ${(props) => props.width};
    max-width: 200px;
    margin: 0 3rem 0 0;
`;

interface TopBarFrameProps {
    content: ComponentInstance;
    hide_logo?: boolean;
    logo_path?: string;
    logo_width?: string;
    top_bar: ComponentInstance;
    top_bar_height?: string;
    top_bar_padding?: string;
}

const LogoutArrow = getIcon('fa-solid fa-arrow-right-from-bracket');

/**
 * The TopBarFrame component is designed as a root component for an app built using the Dara core framework.
 */
function TopBarFrame(props: TopBarFrameProps): JSX.Element {
    const theme = useTheme();
    const logo = props.logo_path && (
        <LogoImage alt="Logo" src={prependBaseUrl(props.logo_path)} width={props.logo_width} />
    );
    const logoSrc = theme.themeType === 'dark' ? DaraDark : DaraLight;
    const daraLogo = <img alt="Dara" src={logoSrc} />;

    return (
        <Wrapper backgroundColor={theme.colors.background} direction="column">
            <TopBar height={props.top_bar_height} style={{ padding: props.top_bar_padding }}>
                <TopBarContent>
                    {!props.hide_logo && logo}
                    {props.top_bar && (
                        <RouteButtons direction="row">
                            <DirectionCtx.Provider value={{ direction: 'row' }}>
                                {props.top_bar && <DynamicComponent component={props.top_bar} />}
                            </DirectionCtx.Provider>
                        </RouteButtons>
                    )}
                    <LogoutButton href="/logout" styling="error">
                        <LogoutArrow style={{ marginRight: '0.5rem' }} />
                        Logout
                    </LogoutButton>
                </TopBarContent>
                <BuiltWithSpan>Built with {daraLogo}</BuiltWithSpan>
            </TopBar>

            <Wrapper style={{ padding: '2rem 3rem' }}>
                {props.content && <DynamicComponent component={props.content} />}
            </Wrapper>
        </Wrapper>
    );
}

export default TopBarFrame;
