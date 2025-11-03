import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import { useVariable } from '@/shared/interactivity';
import type { BaseComponentProps, ComponentInstance, Variable } from '@/types';

interface PublicDynamicComponentProps extends BaseComponentProps {
    component: ComponentInstance | Variable<ComponentInstance>;
}

/**
 * Thin wrapper around DynamicComponent that allows for a variable to be passed in instead of a component instance.
 */
function PublicDynamicComponent(props: PublicDynamicComponentProps): JSX.Element {
    const [component] = useVariable(props.component);
    return <DynamicComponent component={component} />;
}

export default PublicDynamicComponent;
