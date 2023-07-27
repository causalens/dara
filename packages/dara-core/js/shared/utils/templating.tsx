import copy from 'lodash/cloneDeep';
import set from 'lodash/set';

import { ComponentInstance, TemplateMarker, TemplatedComponentInstance } from '@/types';

/**
 * Checks if a value is a TemplateMarker.
 *
 * @param value value to check
 */
function isTemplateMarker(value: any): value is TemplateMarker {
    return value && typeof value === 'object' && value.__typename === 'TemplateMarker';
}

/**
 * Recursively searches through the component instance looking for TemplateMarker instances.
 *
 * @param component component to search through
 */
export function hasTemplateMarkers(component: ComponentInstance): boolean {
    if (!component || typeof component !== 'object') {
        return false;
    }

    for (const value of Object.values(component)) {
        if (isTemplateMarker(value)) {
            return true;
        }
        if (value && typeof value === 'object') {
            return hasTemplateMarkers(value);
        }
    }

    return false;
}

/**
 * Recursively searches through the templated component instance looking for TemplateMarker instances.
 * Returns a map of the path to the marker to the field name of the marker.
 *
 * @param template template to search through
 */
export function getMarkerPaths(template: ComponentInstance & TemplatedComponentInstance): Record<string, string> {
    const paths: Record<string, string> = {};

    function recurse(component: ComponentInstance, path: string): void {
        for (const [key, value] of Object.entries(component)) {
            if (isTemplateMarker(value)) {
                paths[path + key] = value.field_name;
            } else if (value instanceof Object) {
                recurse(value, `${path + key}.`);
            }
        }
    }

    recurse(template, '');

    return paths;
}

/**
 * Replaces markers in a template with data.
 * Utilises lodash.set to set the value of the marker.
 *
 * @param template template to replace markers in
 * @param data data to replace markers with
 * @param paths paths to markers in the template
 */
export function replaceMarkers(
    template: ComponentInstance & TemplatedComponentInstance,
    data: Record<string, any>,
    paths: Record<string, string>
): ComponentInstance & TemplatedComponentInstance {
    const templateCopy = copy(template);

    for (const [path, fieldName] of Object.entries(paths)) {
        const value = data[fieldName];
        set(templateCopy, path, value);
    }

    return templateCopy;
}
