import { BaseComponentProps, ComponentInstance } from "@/types";

/**
 * Clean properties for a component.
 */
export function cleanProps(props: BaseComponentProps): BaseComponentProps {
    // filter out null/undefined children
    if ('children' in props && Array.isArray(props.children)) {
        const propsCopy = { ...props } as BaseComponentProps & { children: Array<ComponentInstance | null> };
        propsCopy.children = props.children.filter(Boolean);

        return propsCopy;
    }

    return props;
}
