import { createGlobalStyle } from '@darajs/styled-components';

export const GlobalStyle = createGlobalStyle`
/* stylelint-disable selector-id-pattern */
html,
body,
#dara_root {
    font-size: ${(props) => props.theme.font.size};
}
`;
