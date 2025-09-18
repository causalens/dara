import * as React from 'react';
import { NavLink, type NavLinkProps } from 'react-router';
import styled from 'styled-components';

import { usePreloadRoute } from '@/router/fetching';
import { DisplayCtx } from '@/shared/context';
import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import { useVariable } from '@/shared/interactivity';
import useComponentStyles from '@/shared/utils/use-component-styles';
import type { ComponentInstance, StyledComponentProps, Variable } from '@/types';

type MaybeVariable<T> = T | Variable<T>;

export interface LinkProps extends StyledComponentProps {
    className?: string;
    case_sensitive: boolean;
    children: Array<ComponentInstance>;
    prefetch?: boolean;
    relative: NavLinkProps['relative'];
    replace: NavLinkProps['replace'];
    to: MaybeVariable<NavLinkProps['to']>;
    // Used via useComponentStyles
    // eslint-disable-next-line react/no-unused-prop-types
    active_css?: StyledComponentProps['raw_css'];
    // eslint-disable-next-line react/no-unused-prop-types
    inactive_css?: StyledComponentProps['raw_css'];
    end: NavLinkProps['end'];
}

const NavLinkWrapper = React.forwardRef(
    (
        props: NavLinkProps & {
            activeStyle?: React.CSSProperties;
            inactiveStyle?: React.CSSProperties;
            prefetch?: boolean;
        },
        ref: React.Ref<HTMLAnchorElement>
    ) => {
        const { to, className, style, activeStyle, inactiveStyle, prefetch, ...rest } = props;
        return (
            <NavLink
                ref={ref}
                to={to}
                className={className}
                style={({ isActive }) => {
                    return {
                        ...style,
                        ...(isActive ? activeStyle : inactiveStyle),
                    };
                }}
                {...rest}
            >
                {props.children}
            </NavLink>
        );
    }
);

const StyledNavLink = styled(NavLinkWrapper)<{ $activeCss: string; $inactiveCss: string }>`
    &[aria-current] {
        ${(props) => props.$activeCss}
    }

    &:not([aria-current]) {
        ${(props) => props.$inactiveCss}
    }
`;

function Link(props: LinkProps): React.ReactNode {
    const displayCtx = React.useContext(DisplayCtx);
    const [style, css] = useComponentStyles(props);
    const [activeStyle, activeCss] = useComponentStyles(props, true, 'active_css');
    const [inactiveStyle, inactiveCss] = useComponentStyles(props, false, 'inactive_css');
    const [to] = useVariable(props.to);

    // Prefetching approach inspired by SolidJS's router:
    // https://github.com/solidjs/solid-router/blob/30f08665e87829736a9333d55863d27905f4a92d/src/data/events.ts#L7
    const preloadRoute = usePreloadRoute();
    const preloadTimeoutRef = React.useRef<number | null>(null);

    // Clear any existing timeout
    const clearPreloadTimeout = React.useCallback(() => {
        if (preloadTimeoutRef.current !== null) {
            clearTimeout(preloadTimeoutRef.current);
            preloadTimeoutRef.current = null;
        }
    }, []);

    // Immediate preload (for focus/touch events)
    const handleImmediatePreload = React.useCallback(() => {
        if (!props.prefetch) {
            return;
        }

        preloadRoute(to);
    }, [props.prefetch, preloadRoute, to]);

    // Delayed preload (for mouse move events)
    const handleDelayedPreload = React.useCallback(() => {
        if (!props.prefetch) {
            return;
        }

        // Clear any existing timeout
        clearPreloadTimeout();

        // Set timeout for delayed preload (20ms)
        preloadTimeoutRef.current = window.setTimeout(() => {
            preloadRoute(to);
        }, 20);
    }, [props.prefetch, to, clearPreloadTimeout, preloadRoute]);

    // Event handlers
    const handleMouseMove = React.useCallback(() => {
        handleDelayedPreload();
    }, [handleDelayedPreload]);

    const handleFocus = React.useCallback(() => {
        handleImmediatePreload();
    }, [handleImmediatePreload]);

    const handleTouchStart = React.useCallback(() => {
        handleImmediatePreload();
    }, [handleImmediatePreload]);

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            clearPreloadTimeout();
        };
    }, [clearPreloadTimeout]);

    return (
        <DisplayCtx.Provider value={{ component: 'anchor', direction: displayCtx.direction }}>
            <StyledNavLink
                id={props.id_}
                className={props.className}
                to={to}
                end={props.end}
                caseSensitive={props.case_sensitive}
                replace={props.replace}
                relative={props.relative}
                $activeCss={css + activeCss}
                $inactiveCss={css + inactiveCss}
                style={style}
                activeStyle={activeStyle}
                inactiveStyle={inactiveStyle}
                onMouseMove={props.prefetch ? handleMouseMove : undefined}
                onFocus={props.prefetch ? handleFocus : undefined}
                onTouchStart={props.prefetch ? handleTouchStart : undefined}
            >
                {props.children.map((child, idx) => (
                    <DynamicComponent component={child} key={idx} />
                ))}
            </StyledNavLink>
        </DisplayCtx.Provider>
    );
}

export default Link;
