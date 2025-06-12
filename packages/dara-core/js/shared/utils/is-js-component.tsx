import { type Component, ComponentType, type JsComponent } from '@/types';

/**
 * Check a component is a JS component and apply a type guard for the returned type
 *
 * @param component - the component to check
 */
function isJsComponent(component: Component): component is JsComponent {
    return component.type === ComponentType.JS;
}

export default isJsComponent;
