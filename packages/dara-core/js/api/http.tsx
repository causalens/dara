/* eslint-disable import/prefer-default-export */
import cloneDeep from 'lodash/cloneDeep';

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
export async function request(url: string | URL, ...options: RequestExtras[]): Promise<Response> {
    const mergedOptions = options.reduce<RequestExtras>((acc, opt) => ({ ...acc, ...opt }), {});

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

    const baseUrl: string = window.dara?.base_url ?? '';
    const urlString = url instanceof URL ? url.pathname + url.search : url;

    return fetch(baseUrl + urlString, {
        credentials,
        headers: headersInterface,
        ...other,
    });
}
