import * as React from 'react';
import { NavLink, type NavLinkProps } from 'react-router';
import styled from 'styled-components';

import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import useComponentStyles from '@/shared/utils/use-component-styles';
import type { ComponentInstance, StyledComponentProps } from '@/types';

export interface LinkProps extends StyledComponentProps {
    className?: string;
    case_sensitive: boolean;
    children: Array<ComponentInstance>;
    // TODO: not implemented yet
    // eslint-disable-next-line react/no-unused-prop-types
    prefetch: NavLinkProps['prefetch'];
    relative: NavLinkProps['relative'];
    replace: NavLinkProps['replace'];
    to: NavLinkProps['to'];
    // Used via useComponentStyles
    // eslint-disable-next-line react/no-unused-prop-types
    active_css?: StyledComponentProps['raw_css'];
    // eslint-disable-next-line react/no-unused-prop-types
    inactive_css?: StyledComponentProps['raw_css'];
    end: NavLinkProps['end'];
}

const StyledNavLink = styled(NavLink)<{ $activeCss: string; $inactiveCss: string }>`
    &[aria-current] {
        ${(props) => props.$activeCss}
    }

    &:not([aria-current]) {
        ${(props) => props.$inactiveCss}
    }
`;

function Link(props: LinkProps): React.ReactNode {
    const [style, css] = useComponentStyles(props);
    const [activeStyle, activeCss] = useComponentStyles(props, true, 'active_css');
    const [inactiveStyle, inactiveCss] = useComponentStyles(props, false, 'inactive_css');

    return (
        <StyledNavLink
            className={props.className}
            to={props.to}
            end={props.end}
            // TODO: native prefetch doesn't work in Data mode, instead reimplement and call prefetchQuery manually
            // prefetch={props.prefetch}
            caseSensitive={props.case_sensitive}
            replace={props.replace}
            relative={props.relative}
            $activeCss={css + activeCss}
            $inactiveCss={css + inactiveCss}
            style={({ isActive }) => ({
                ...style,
                ...(isActive ? activeStyle : inactiveStyle),
            })}
        >
            {props.children.map((child, idx) => (
                <DynamicComponent component={child} key={idx} />
            ))}
        </StyledNavLink>
    );
}

export default Link;
