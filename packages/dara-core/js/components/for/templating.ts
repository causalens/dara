import cloneDeep from 'lodash/cloneDeep';
import isPlainObject from 'lodash/isPlainObject';
import set from 'lodash/set';
import { nanoid } from 'nanoid';
import * as React from 'react';

import { resolveNested } from '@/shared/interactivity/nested';
import type { ComponentInstance } from '@/types';
import { isAnnotatedAction, isDerivedVariable, isLoopVariable, isPyComponent } from '@/types/utils';

export type Marker =
    | { type: 'loop_var'; path: string; nested: string[] }
    | { type: 'action'; path: string }
    | {
          type: 'derived_var';
          path: string;
          loopInstanceUid: string;
      }
    | { type: 'server_component'; path: string; loopInstanceUid: string };

interface ScopeContext {
    action?: string;
    derivedVariable?: string;
    serverComponent?: string;
}

/**
 * Create markers for a given scope and loop instance uid.
 * Used in the terminal case when we find a loop variable. Adds markers for the current action/derived variable/server component we're within.
 */
function createMarkers(scope: ScopeContext, loopInstanceUid: string): Marker[] {
    const markers: Marker[] = [];

    if (scope.action) {
        markers.push({ type: 'action', path: scope.action });
    }

    if (scope.derivedVariable) {
        markers.push({ type: 'derived_var', path: scope.derivedVariable, loopInstanceUid });
    }

    if (scope.serverComponent) {
        markers.push({ type: 'server_component', path: scope.serverComponent, loopInstanceUid });
    }

    return markers;
}

function updateScope(scope: ScopeContext, value: any, path: string): ScopeContext {
    const newScope = { ...scope };

    if (!scope.action && isAnnotatedAction(value)) {
        newScope.action = path;
    }

    if (!scope.derivedVariable && isDerivedVariable(value)) {
        newScope.derivedVariable = path;
    }

    if (!scope.serverComponent && isPyComponent(value)) {
        newScope.serverComponent = path;
    }

    return newScope;
}

/**
 * Get markers for injection points in a renderer
 *
 * @param renderer renderer to check
 */
export function getInjectionMarkers(renderer: Record<string, any>): Marker[] {
    const markers: Marker[] = [];

    function walk(obj: Record<string, any>, pathSegments: string[], scope: ScopeContext = {}): void {
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = [...pathSegments, key];
            const dotPath = currentPath.join('.');

            // loop var found (terminal case)
            if (isLoopVariable(value)) {
                markers.push(
                    { path: dotPath, nested: value.nested, type: 'loop_var' },
                    ...createMarkers(scope, value.uid)
                );

                continue;
            }

            if (isPlainObject(value) || Array.isArray(value)) {
                const newScope = updateScope(scope, value, dotPath);

                // recurse into objects/arrays, keeping track of the path
                walk(value, [...pathSegments, key], newScope);
            }
        }
    }

    walk(renderer, []);

    return markers;
}

// Special markers used by the For component
const MARKER_INDEX = '__index';
const MARKER_IS_LAST = '__is_last';
const MARKER_IS_FIRST = '__is_first';

/**
 * Inject a loop variable into a renderer.
 * This will replace any loop variable in the renderer with the loop value.
 *
 * @param renderer renderer to inject into
 * @param markers paths of loop variables in the renderer
 * @param loopValue value to inject
 */
export function applyMarkers<T extends Record<string, any>>({
    renderer,
    markers,
    loopValue,
    itemKey,
    index,
    itemsLength,
}: {
    renderer: T;
    markers: Marker[];
    loopValue: any;
    itemKey: React.Key;
    index: number;
    itemsLength: number;
}): T {
    // early exit if there are no markers
    if (markers.length === 0) {
        return renderer;
    }

    const clonedRenderer = cloneDeep(renderer);

    for (const marker of markers) {
        switch (marker.type) {
            case 'loop_var': {
                let value;

                // special case for index, is_last, and is_first markers
                if (marker.nested.length === 1 && marker.nested[0] === MARKER_INDEX) {
                    value = index;
                } else if (marker.nested.length === 1 && marker.nested[0] === MARKER_IS_LAST) {
                    value = index === itemsLength - 1;
                } else if (marker.nested.length === 1 && marker.nested[0] === MARKER_IS_FIRST) {
                    value = index === 0;
                } else {
                    // replace loop variable with the loop value using the nested path
                    value = resolveNested(loopValue, marker.nested);
                }

                set(clonedRenderer, marker.path, value);
                break;
            }
            case 'action': {
                // regenerate uids for actions for the loading variables as well so they are separate
                set(clonedRenderer, `${marker.path}.loading.uid`, nanoid());
                break;
            }
            case 'derived_var': {
                // inject the loop variable uid into it so we can track it separately on the client
                set(clonedRenderer, `${marker.path}.loop_instance_uid`, `${marker.loopInstanceUid}:${itemKey}`);
                break;
            }
            case 'server_component': {
                // inject the loop variable uid into it so we can track it separately on the client
                set(clonedRenderer, `${marker.path}.loop_instance_uid`, `${marker.loopInstanceUid}:${itemKey}`);
                break;
            }
        }
    }

    return clonedRenderer;
}

/**
 * Check if the renderer component has any loop variables
 * Only checks top-level props of the component
 */
export function hasMarkers(component: ComponentInstance): string | null {
    for (const [key, value] of Object.entries(component.props)) {
        if (isLoopVariable(value)) {
            return key;
        }
    }

    return null;
}
