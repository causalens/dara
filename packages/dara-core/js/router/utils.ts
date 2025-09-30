/**
 * Get the basename of the app, uses window.dara.base_url if set, otherwise '/'
 */
export function getBasename(): string {
    if (window.dara.base_url !== '') {
        return new URL(window.dara.base_url, window.origin).pathname;
    }
    return '/';
}
