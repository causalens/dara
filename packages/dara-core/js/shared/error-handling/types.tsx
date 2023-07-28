export interface SelectorError {
    selectorId: string;
}

/**
 * Check whether an error originated from a Recoil selector, i.e. it has a selectorId attached
 *
 * @param e error to check
 */
export function isSelectorError(e: unknown): e is SelectorError {
    return e !== undefined && e !== null && typeof e === 'object' && 'selectorId' in e;
}
