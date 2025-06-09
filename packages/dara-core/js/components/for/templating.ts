import cloneDeep from 'lodash/cloneDeep';
import isPlainObject from 'lodash/isPlainObject';
import set from 'lodash/set';
import { nanoid } from 'nanoid';

import { resolveNested } from '@/shared/interactivity/nested';
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

/**
 * Get markers for injection points in a renderer
 *
 * @param renderer renderer to check
 */
export function getInjectionMarkers(renderer: Record<string, any>): Marker[] {
    const paths: Marker[] = [];

    function recurse(
        obj: Record<string, any>,
        path: string[],
        scope: {
            actionPath: string[] | null;
            derivedVariablePath: string[] | null;
            serverComponentPath: string[] | null;
        }
    ): void {
        for (const [key, value] of Object.entries(obj)) {
            if (isLoopVariable(value)) {
                // loop var found! construct the dotted path
                const resolvedPath = [...path, key].join('.');
                paths.push({ path: resolvedPath, nested: value.nested, type: 'loop_var' });

                // Keep track of other paths we were in
                if (scope.actionPath) {
                    paths.push({ path: scope.actionPath.join('.'), type: 'action' });
                }
                if (scope.derivedVariablePath) {
                    paths.push({
                        path: scope.derivedVariablePath.join('.'),
                        type: 'derived_var',
                        loopInstanceUid: value.uid,
                    });
                }
                if (scope.serverComponentPath) {
                    paths.push({
                        path: scope.serverComponentPath.join('.'),
                        type: 'server_component',
                        loopInstanceUid: value.uid,
                    });
                }
            } else if (isPlainObject(value) || Array.isArray(value)) {
                let newScope = { ...scope };

                if (!scope.actionPath && isAnnotatedAction(value)) {
                    newScope.actionPath = [...path, key];
                }

                if (!scope.derivedVariablePath && isDerivedVariable(value)) {
                    newScope.derivedVariablePath = [...path, key];
                }

                if (!scope.serverComponentPath && isPyComponent(value)) {
                    newScope.serverComponentPath = [...path, key];
                }

                // recurse into objects/arrays, keeping track of the path
                recurse(value, [...path, key], newScope);
            }
        }
    }

    recurse(renderer, [], { actionPath: null, derivedVariablePath: null, serverComponentPath: null });

    return paths;
}

/**
 * Inject a loop variable into a renderer.
 * This will replace any loop variable in the renderer with the loop value.
 *
 * @param renderer renderer to inject into
 * @param markers paths of loop variables in the renderer
 * @param loopValue value to inject
 */
export function applyMarkers<T extends Record<string, any>>(
    renderer: T,
    markers: Marker[],
    loopValue: any,
    itemKey: string | number
): T {
    const clonedRenderer = cloneDeep(renderer);

    for (const marker of markers) {
        switch (marker.type) {
            case 'loop_var': {
                // replace loop variable with the loop value using the nested path
                set(clonedRenderer, marker.path, resolveNested(loopValue, marker.nested));
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
