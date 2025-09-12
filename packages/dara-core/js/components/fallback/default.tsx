import { theme } from '@darajs/styled-components';
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
    // using static colors from default theme to be able to use outside theme provider
    return <StyledDots grey3={theme.colors.grey3} grey4={theme.colors.grey4} />;
}

export default DefaultFallback;
