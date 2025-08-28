import { transparentize } from 'polished';
import { useContext } from 'react';
import { NavLink } from 'react-router';

import styled from '@darajs/styled-components';

import { DirectionCtx } from '@/shared/context';
import { getIcon } from '@/shared/utils';
import { type RouteLink } from '@/types';

interface MenuItemProps {
    direction: 'column' | 'row';
}

const MenuItem = styled(NavLink)<MenuItemProps>`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: ${(props) => (props.direction === 'row' ? 'center' : 'flex-start')};

    width: ${(props) => (props.direction === 'row' ? '10rem' : '100%')};
    height: 3rem;
    padding: 0 1rem;

    font-size: 0.875rem;
    font-weight: 700;
    color: ${(props) => props.theme.colors.secondary};
    text-decoration: none;

    border-radius: 1rem;

    :hover {
        background: ${(props) => transparentize(0.9, props.theme.colors.secondary)};
    }

    :active {
        background: ${(props) => transparentize(0.8, props.theme.colors.secondary)};
    }

    svg {
        margin-right: 0.6rem;
        color: ${(props) => props.theme.colors.blue1};
    }

    &.selected {
        color: ${(props) => props.theme.colors.blue1};
        background-color: ${(props) => props.theme.colors.secondary};
    }
`;

interface MenuProps {
    /** A list of routes to display in the menu */
    routes: Array<RouteLink>;
}

/**
 * The menu component is a context aware component that will render a list of menu options into it's surrounding
 * container based on a list of routes passed in.
 *
 * @param props - the component props
 */
function Menu(props: MenuProps): JSX.Element {
    const directionCtx = useContext(DirectionCtx);

    return (
        <>
            {props.routes.map(({ icon, name, route }) => {
                const Icon = icon ? getIcon(icon) : null;
                return (
                    <MenuItem activeClassName="selected" direction={directionCtx.direction} key={name} to={route}>
                        {Icon && <Icon style={{ marginRight: '0.5rem' }} />}
                        {name}
                    </MenuItem>
                );
            })}
        </>
    );
}

export default Menu;
