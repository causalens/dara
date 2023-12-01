/* eslint-disable import/prefer-default-export */

/**
 * Request options to merge into the provided options.
 */
export interface RequestOptions {
    options?: RequestInit;
    sessionToken?: string;
}

/**
 * Extra options to pass to the request function.
 * If a string is passed, it is assumed to be the session token.
 * If an object is passed, it is assumed to be a RequestOptions object with the token and additional options.
 */
export type RequestExtras = string | RequestOptions;

/**
 * Light wrapper around fetch.
 *
 * @param url URL
 * @param options  fetch options
 * @param extras request extras to be merged into the options
 */
export async function request(url: string | URL, options: RequestInit, extras?: RequestExtras): Promise<Response> {
    const sessionToken = typeof extras === 'string' ? extras : extras?.sessionToken;
    const mergedOptions = extras && typeof extras === 'object' ? { ...options, ...extras.options } : options;

    const { headers, ...other } = mergedOptions;

    const baseUrl: string = window.dara?.base_url ?? '';

    const urlString = url instanceof URL ? url.pathname + url.search : url;

    return fetch(baseUrl + urlString, {
        headers: {
            Accept: (mergedOptions?.headers as Record<string, string>)?.Accept ?? 'application/json',
            // Only set content-type json when body is included but it's not formdata
            ...(mergedOptions?.body && !(mergedOptions?.body instanceof FormData)
                ? { 'Content-Type': 'application/json' }
                : {}),
            // Add auth header if token is passed
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
            ...(headers ?? {}),
        },
        ...other,
    });
}
