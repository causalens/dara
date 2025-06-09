import { injectCss, useComponentStyles } from '@/shared/utils';
import { type StyledComponentProps } from '@/types';

import Dots from './dots';

const StyledDots = injectCss(Dots);

type DefaultFallbackProps = StyledComponentProps;

function DefaultFallback(props: DefaultFallbackProps): JSX.Element {
    const [style, css] = useComponentStyles(props);

    return <StyledDots $rawCss={css} style={style} />;
}

export default DefaultFallback;
