import { createGlobalStyle } from '@darajs/styled-components';

export const GlobalStyle = createGlobalStyle`
/* stylelint-disable selector-id-pattern */
html,
body,
#dara_root {
    font-size: ${(props) => props.theme.font.size};
}

/* NOTE: the color is hard-coded intentionally as we want a blue progress bar regardless of the theme */
#nprogress {
    pointer-events: none;
}

#nprogress .bar {
    position: fixed;
    z-index: 1031;
    top: 0;
    left: 0;

    width: 100%;
    height: 2px;

    background: #3796f6;
}

#nprogress .peg {
    position: absolute;
    right: 0;
    transform: rotate(3deg) translate(0, -4px);

    display: block;

    width: 100px;
    height: 100%;

    opacity: 1;
    box-shadow:
        0 0 10px #3796f6,
        0 0 5px #3796f6;
}

.nprogress-custom-parent {
    position: relative;
    overflow: hidden;
}

.nprogress-custom-parent #nprogress .spinner,
.nprogress-custom-parent #nprogress .bar {
    position: absolute;
}
`;
