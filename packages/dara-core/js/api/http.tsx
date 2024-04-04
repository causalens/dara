/* eslint-disable import/prefer-default-export */
import cloneDeep from 'lodash/cloneDeep';

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
 * Serializable form of RequestExtras.
 * Required to use for e.g. recoil params as they need to be serializable.
 */
export class RequestExtrasSerializable {
    extras: RequestExtras;

    constructor(extras: RequestExtras) {
        this.extras = extras;
    }

    /**
     * Get the serializable form of the extras.
     * Transforms the headers into a serializable format rather than a Headers object.
     */
    toSerializable(): RequestExtras | null {
        if (!this.extras) {
            return null;
        }

        if (typeof this.extras === 'string') {
            return this.extras;
        }

        const serializable = cloneDeep(this.extras);

        // Make headers serializable
        if (serializable.options?.headers) {
            const headers = new Headers(serializable.options.headers);
            serializable.options.headers = Object.fromEntries(headers.entries());
        }

        return serializable;
    }

    /**
     * Serialize the extras into a string.
     */
    toJSON(): string | null {
        const serializable = this.toSerializable();

        if (!serializable) {
            return null;
        }

        return JSON.stringify(serializable);
    }
}

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

    const headersInterface = new Headers(headers);

    // default to json accept header
    if (!headersInterface.has('Accept')) {
        headersInterface.set('Accept', 'application/json');
    }

    // default to json content type header unless body is formdata
    if (!headersInterface.has('Content-Type') && mergedOptions?.body && !(mergedOptions?.body instanceof FormData)) {
        headersInterface.set('Content-Type', 'application/json');
    }

    // default auth header if token is passed
    if (sessionToken && !headersInterface.has('Authorization')) {
        headersInterface.set('Authorization', `Bearer ${sessionToken}`);
    }

    const baseUrl: string = window.dara?.base_url ?? '';
    const urlString = url instanceof URL ? url.pathname + url.search : url;

    return fetch(baseUrl + urlString, {
        headers: headersInterface,
        ...other,
    });
}
