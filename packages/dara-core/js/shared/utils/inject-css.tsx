import type { StyledComponent } from 'styled-components';

import styled, { DefaultTheme } from '@darajs/styled-components';

export interface RawCssProp {
    $rawCss?: string;
}

const BaseRawCssInject = styled.div<RawCssProp>`
    ${(props) => props.$rawCss}
`;

/**
 * Helper method to wrap a component into a styled component with $rawCss prop
 *
 * @param component component to inject $rawCss into
 */
export function injectCss<C extends keyof JSX.IntrinsicElements | React.ComponentType<any>>(
    component: C
): StyledComponent<C, DefaultTheme, RawCssProp> {
    // raw html components
    if (typeof component === 'string') {
        // For div just re-use the base
        if (component === 'div') {
            // Have to cast it as otherwise typescript complaints 'div' is too specific compared to type `C`
            return BaseRawCssInject as any as StyledComponent<C, DefaultTheme, RawCssProp>;
        }

        // Otherwise re-use base but change the html tag
        return BaseRawCssInject.withComponent<C>(component);
    }

    return styled(component)<RawCssProp>`
        ${(props) => props.$rawCss}
    `;
}
