import styled from '@darajs/styled-components';

import { injectCss, useComponentStyles } from '@/shared/utils';
import { StyledComponentProps } from '@/types';

import Dots from './dots';

const RowDots = styled(Dots)`
    height: 2.5rem;
`;
const StyledDots = injectCss(RowDots);

type RowFallbackProps = StyledComponentProps;

function RowFallback(props: RowFallbackProps): JSX.Element {
    const [style, css] = useComponentStyles(props);

    return <StyledDots $rawCss={css} style={style} />;
}

export default RowFallback;
