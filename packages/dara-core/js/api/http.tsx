/* eslint-disable import/prefer-default-export */
import cloneDeep from 'lodash/cloneDeep';

import { validateResponse } from '@darajs/ui-utils';

import {
    getLatestSessionToken,
    notifySessionLoggedOut,
    notifySessionRefreshed,
    runSessionRefresh,
    waitForOngoingSessionRefresh,
} from '@/auth/session-coordination';

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
 * @param options optional fetch options. Multiple option sets can be provided, they will be merged in order with later options overriding earlier ones.
 */
export async function request(url: string | URL, ...options: RequestInit[]): Promise<Response> {
    // If another request/tab is currently refreshing the session, wait for it first
    // so we don't send avoidable 401/403 requests with stale credentials.
    await waitForOngoingSessionRefresh();
    const sessionToken = getLatestSessionToken();
    const mergedOptions = options.reduce((acc, opt) => ({ ...acc, ...opt }), {});

    const { headers, credentials: mergedCredentials, ...other } = mergedOptions;
    const credentials = mergedCredentials ?? 'include';

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
        credentials,
        headers: headersInterface,
        ...other,
    });

    // in case of an auth error, attempt to refresh the token and retry the request
    if (response.status === 401 || response.status === 403) {
        try {
            // Ensure only one tab refreshes at a time; others wait and reuse the refreshed token.
            const refreshedToken = await runSessionRefresh(async () => {
                const latestToken = getLatestSessionToken();
                // Another tab/request may have already refreshed while we were waiting for the lock.
                if (latestToken !== sessionToken) {
                    return latestToken;
                }

                const refreshHeaders = new Headers({ Accept: 'application/json' });
                if (latestToken) {
                    refreshHeaders.set('Authorization', `Bearer ${latestToken}`);
                }

                const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh-token`, {
                    credentials,
                    headers: refreshHeaders,
                    method: 'POST',
                });
                if (refreshResponse.ok) {
                    const content = await refreshResponse.json();
                    if (
                        content &&
                        typeof content === 'object' &&
                        'token' in content &&
                        typeof content.token === 'string'
                    ) {
                        notifySessionRefreshed(content.token);
                        return content.token;
                    }

                    throw new Error('Refresh response missing token');
                }

                notifySessionLoggedOut();
                // this will throw an error with the error content
                await validateResponse(refreshResponse, 'Request auth error, failed to refresh the session token');
            });

            // retry the request with the new token
            if (refreshedToken) {
                headersInterface.set('Authorization', `Bearer ${refreshedToken}`);
            } else {
                headersInterface.delete('Authorization');
            }
            return fetch(baseUrl + urlString, {
                credentials,
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
