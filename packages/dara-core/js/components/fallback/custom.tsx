import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import { type ComponentInstance, type StyledComponentProps } from '@/types';

interface DefaultFallbackProps extends StyledComponentProps {
    component: ComponentInstance;
}

function DefaultFallback(props: DefaultFallbackProps): JSX.Element {
    return <DynamicComponent component={props.component} />;
}

export default DefaultFallback;
