import cloneDeep from 'lodash/cloneDeep';
import isPlainObject from 'lodash/isPlainObject';
import set from 'lodash/set';

import { resolveNested } from '@/shared/interactivity/nested';
import { isLoopVariable } from '@/types/utils';

export type LoopVarPath = [path: string, nested: string[]];

/**
 * Get the paths of all loop variables in a renderer
 *
 * @param renderer renderer to check
 */
export function getLoopVarPaths(renderer: Record<string, any>): LoopVarPath[] {
    const paths: LoopVarPath[] = [];

    function recurse(obj: Record<string, any>, path: string[] = []): void {
        for (const [key, value] of Object.entries(obj)) {
            if (isLoopVariable(value)) {
                // loop var found! construct the dotted path
                const resolvedPath = [...path, key].join('.');
                paths.push([resolvedPath, value.nested]);
            } else if (isPlainObject(value) || Array.isArray(value)) {
                // recurse into objects/arrays, keeping track of the path
                recurse(value, [...path, key]);
            }
        }
    }

    recurse(renderer);

    return paths;
}

/**
 * Inject a loop variable into a renderer.
 * This will replace any loop variable in the renderer with the loop value.
 *
 * @param renderer renderer to inject into
 * @param paths paths of loop variables in the renderer
 * @param loopValue value to inject
 */
export function injectLoopVar<T extends Record<string, any>>(renderer: T, paths: LoopVarPath[], loopValue: any): T {
    const clonedRenderer = cloneDeep(renderer);

    for (const [path, nested] of paths) {
        set(clonedRenderer, path, resolveNested(loopValue, nested));
    }

    return clonedRenderer;
}
