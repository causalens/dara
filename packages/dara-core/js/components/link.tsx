import { NavLink, type NavLinkProps } from 'react-router';
import styled from 'styled-components';

import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import useComponentStyles from '@/shared/utils/use-component-styles';
import type { ComponentInstance, StyledComponentProps } from '@/types';

interface LinkProps {
    case_sensitive: boolean;
    children: Array<ComponentInstance>;
    prefetch: NavLinkProps['prefetch'];
    relative: NavLinkProps['relative'];
    replace: NavLinkProps['replace'];
    to: NavLinkProps['to'];
    active_css?: StyledComponentProps['raw_css'];
    inactive_css?: StyledComponentProps['raw_css'];
}

const StyledNavLink = styled(NavLink)<{ $activeCss: string; $inactiveCss: string }>`
    &[aria-current] {
        ${(props) => props.$activeCss}
    }

    &:not([aria-current]) {
        ${(props) => props.$inactiveCss}
    }
`;

function Link(props: LinkProps) {
    const [activeStyle, activeCss] = useComponentStyles(props, true, 'active_css');
    const [inactiveStyle, inactiveCss] = useComponentStyles(props, false, 'inactive_css');

    return (
        <StyledNavLink
            to={props.to}
            // TODO: native prefetch doesn't work in Data mode, instead reimplement and call prefetchQuery manually
            // prefetch={props.prefetch}
            replace={props.replace}
            relative={props.relative}
            $activeCss={activeCss}
            $inactiveCss={inactiveCss}
            style={({ isActive }) => (isActive ? activeStyle : inactiveStyle)}
        >
            {props.children.map((child, idx) => (
                <DynamicComponent component={child} key={idx} />
            ))}
        </StyledNavLink>
    );
}

export default Link;
