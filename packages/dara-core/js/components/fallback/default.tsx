import { Dots } from '@darajs/ui-components';

import { injectCss, useComponentStyles } from '@/shared/utils';
import { type StyledComponentProps } from '@/types';

const StyledDots = injectCss(Dots);

type DefaultFallbackProps = StyledComponentProps;

function DefaultFallback(props: DefaultFallbackProps): JSX.Element {
    const [style, css] = useComponentStyles(props);

    return <StyledDots $rawCss={css} style={style} />;
}

export function DefaultFallbackStatic(): JSX.Element {
    return <StyledDots />;
}

export default DefaultFallback;
