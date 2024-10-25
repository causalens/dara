/* eslint-disable import/prefer-default-export */
import cloneDeep from 'lodash/cloneDeep';

import { validateResponse } from '@darajs/ui-utils';

import globalStore from '@/shared/global-state-store';
import { getTokenKey } from '@/shared/utils/embed';

/**
 * Extra options to pass to the request function.
 */
export type RequestExtras = RequestInit;

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
        if (serializable?.headers) {
            const headers = new Headers(serializable.headers);
            serializable.headers = Object.fromEntries(headers.entries());
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
    // block on the token in case it's locked, i.e. being refreshed by another concurrent request
    const sessionToken = await globalStore.getValue(getTokenKey());
    const mergedOptions = extras ? { ...options, ...extras } : options;

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

    // default auth header if token is present
    if (sessionToken && !headersInterface.has('Authorization')) {
        headersInterface.set('Authorization', `Bearer ${sessionToken}`);
    }

    const baseUrl: string = window.dara?.base_url ?? '';
    const urlString = url instanceof URL ? url.pathname + url.search : url;

    const response = await fetch(baseUrl + urlString, {
        headers: headersInterface,
        ...other,
    });

    // in case of an auth error, attempt to refresh the token and retry the request
    if (response.status === 401 || response.status === 403) {
        try {
            // Lock the token value while it's being replaced.
            // If it's already being replaced, this will instead wait for the replacement to complete
            // rather than invoking the refresh again.
            const refreshedToken = await globalStore.replaceValue(getTokenKey(), async () => {
                const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh-token`, {
                    headers: headersInterface,
                    ...other,
                    method: 'POST',
                });
                if (refreshResponse.ok) {
                    const { token } = await refreshResponse.json();
                    return token;
                }

                // this will throw an error with the error content
                await validateResponse(refreshResponse, 'Request auth error, failed to refresh the session token');
            });

            // retry the request with the new token
            headersInterface.set('Authorization', `Bearer ${refreshedToken}`);
            return fetch(baseUrl + urlString, {
                headers: headersInterface,
                ...other,
            });
        } catch (e) {
            // refresh failed - return the original request, the caller is supposed to handle the error
            // however they wish
            // eslint-disable-next-line no-console
            console.error('Failed to refresh token', e);
            return response;
        }
    }

    return response;
}
