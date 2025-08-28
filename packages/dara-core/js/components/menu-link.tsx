import { useContext } from 'react';

import styled from '@darajs/styled-components';

import { DisplayCtx } from '@/shared';

import Link, { type LinkProps } from './link';
import { transparentize } from 'polished';

const StyledLink = styled(Link)`
    cursor: pointer;

    display: flex;
    align-items: center;
    gap: 0.5rem;

    width: auto;
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

    &[aria-current] {
        color: ${(props) => props.theme.colors.blue1};
        background-color: ${(props) => props.theme.colors.secondary};
    }
`;

export default function MenuLink(props: LinkProps) {
    const displayCtx = useContext(DisplayCtx);
    return (
        <DisplayCtx.Provider value={{ component: 'anchor', direction: displayCtx.direction }}>
            <StyledLink {...props}>{props.children}</StyledLink>
        </DisplayCtx.Provider>
    );
}
