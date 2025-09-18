import { Navigate as RRNavigate, type NavigateProps as RRNavigateProps } from 'react-router';

import { useVariable } from '@/shared/interactivity';
import type { Variable } from '@/types';

type MaybeVariable<T> = T | Variable<T>;

interface NavigateProps {
    to: MaybeVariable<RRNavigateProps['to']>;
}

function Navigate(props: NavigateProps): JSX.Element {
    const { to, ...rest } = props;
    const [toValue] = useVariable(to);
    return <RRNavigate to={toValue} {...rest} />;
}

export default Navigate;
