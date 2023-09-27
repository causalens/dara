import { useContext } from 'react';
import * as React from 'react';

import { DisplayCtx, StyledComponentProps, injectCss, useComponentStyles } from '@darajs/core';
import styled from '@darajs/styled-components';

interface SpacerProps extends StyledComponentProps {
    className: string;
    inset: string;
    line: boolean;
    size: string;
}

interface SpacerLineProps {
    inset: string;
    isHStack: boolean;
}

const StyledLine = styled.div<SpacerLineProps>`
    flex: 0 0 auto;

    width: ${(p) => (p.isHStack ? '1px' : `calc(100% - 2*${p.inset})`)};
    height: ${(p) => (p.isHStack ? `calc(100% - 2*${p.inset})` : '1px')};
    margin: ${(p) => (p.isHStack ? `${p.inset} 0` : `0 ${p.inset}`)};

    background-color: ${(p) => p.theme.colors.grey3};
`;

interface SpacerWrapperProps {
    isHStack: boolean;
    size: string;
    style: React.CSSProperties;
}

const _StyledSpacer = styled.div<SpacerWrapperProps>`
    display: flex;
    flex: 0 0 auto !important;
    align-items: center;

    ${(p) => p.isHStack && 'flex-direction: column; align-self: stretch'};
    ${(p) => (p.isHStack ? `width: ${p.size}` : `height:${p.size}`)};
`;
const StyledSpacer = injectCss(_StyledSpacer);

function Spacer(props: SpacerProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const displayCtx = useContext(DisplayCtx);
    const isHStack = displayCtx.direction === 'horizontal';
    return (
        <StyledSpacer $rawCss={css} className={props.className} isHStack={isHStack} size={props.size} style={style}>
            {props.line && <StyledLine inset={props.inset} isHStack={isHStack} />}
        </StyledSpacer>
    );
}

export default Spacer;
