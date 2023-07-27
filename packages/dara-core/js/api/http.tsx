/* eslint-disable import/prefer-default-export */

/**
 * Light wrapper around fetch.
 *
 * @param url URL
 * @param options  fetch options
 * @param sessionToken token to use for auth
 */
export async function request(url: string | URL, options: RequestInit, sessionToken?: string): Promise<Response> {
    const { headers, ...other } = options;

    const baseUrl: string = window.dara?.base_url ?? '';

    const urlString = url instanceof URL ? url.pathname + url.search : url;

    return fetch(baseUrl + urlString, {
        headers: {
            Accept: (options?.headers as Record<string, string>)?.Accept ?? 'application/json',
            // Only set content-type json when body is included but it's not formdata
            ...(options?.body && !(options?.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
            // Add auth header if token is passed
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
            ...(headers ?? {}),
        },
        ...other,
    });
}
