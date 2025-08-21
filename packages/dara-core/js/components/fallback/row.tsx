import styled from '@darajs/styled-components';
import { Dots } from '@darajs/ui-components';

import { injectCss, useComponentStyles } from '@/shared/utils';
import { type StyledComponentProps } from '@/types';

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
