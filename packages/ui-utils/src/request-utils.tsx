/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { BehaviorSubject } from 'rxjs';
import shortid from 'shortid';

import { HTTP_METHOD } from './constants';

export interface SortingRule {
    desc?: boolean;
    id: string;
}

export interface FilterRule {
    id: string;
    value: string | Array<string>;
}

/** Standard interface for any additional request options that are required */
export interface RequestOptions {
    filter?: Array<FilterRule>;
    limit?: number;
    searchTerm?: string;
    sort?: Array<SortingRule>;
    startIndex?: number;
}

/** Error class for request errors that allow them to be caught more easily */
export class RequestError extends Error {
    requestParams: { [k: string]: any };

    status: number;

    constructor(status: number, message: string, requestParams?: { [k: string]: any }) {
        super(message);
        this.name = 'ServiceError';
        this.status = status;
        this.requestParams = requestParams;
    }
}

/**
 * Request helper for converting an options object into a valid query string
 *
 * @param options The request options object to convert, will handle it being undefined
 */
export const getQueryStr = (options?: RequestOptions, extras?: { [k: string]: string | number | boolean }): string => {
    if (!options && !extras) {
        return '';
    }

    let query = '?';

    if (Number.isInteger(options.startIndex)) {
        query += `offset=${options.startIndex}&`;
    }
    if (Number.isInteger(options.limit)) {
        query += `limit=${options.limit}&`;
    }
    if (options.searchTerm) {
        query += `query=${options.searchTerm}&`;
    }
    if (options.sort && options.sort.length > 0) {
        // Handle all items in array of sorting rules
        query += `order_by=${options.sort.map((sort) => `${sort.desc ? '-' : ''}${sort.id}`).join(',')}&`;
    }
    if (options.filter && options.filter.length > 0) {
        for (const filter of options.filter) {
            // Handle single filters or arrays of filter terms
            if (typeof filter.value === 'string') {
                query += `${filter.id}=${filter.value}&`;
            } else {
                for (const val of filter.value) {
                    query += `${filter.id}=${val}&`;
                }
            }
        }
    }

    try {
        Object.keys(extras).forEach((key) => {
            query += `${key}=${String(extras[key])}&`;
        });
    } catch {
        // Do nothing as it was probably empty
    }

    return query.replace(/&$/, '');
};

/**
 * Request helper for checking valid response status
 *
 * @param res The response to check
 */
export const isValidResponse = (res: Response): boolean => {
    return res.status >= 100 && res.status < 400;
};

/**
 * Request helper to check whether a response is valid and throw a Service error instance if it is not.
 *
 * @param res the response to check
 * @param fallbackMessage a fallback error message if one is not provided
 */
export async function validateResponse(
    res: Response,
    fallbackMessage: string,
    requestParams?: { [k: string]: any }
): Promise<void> {
    if (!isValidResponse(res)) {
        let message = fallbackMessage;
        try {
            const json = await res.json();
            message = json?.message || json?.detail || fallbackMessage;
        } catch (e) {
            if (fallbackMessage) {
                try {
                    message = (await res.text()) || fallbackMessage;
                } catch {
                    // do nothing, use fallback message
                }
            }
        }
        throw new RequestError(res.status, message, requestParams);
    }
}

export const CHUNK_SIZE = 5e6;

/**
 * An async function that loops over a file and uploads it chunk by chunk, whilst notifying the calling function of it's
 * progress via an Rx stream.
 *
 * @param url the url to upload too
 * @param file the file to upload
 * @param authHeaders the authHeaders to upload with
 * @param extras a dict of extras to also set on the form
 * @param sub an optional subject notify the calling code of current progress
 */
export async function chunkedFileUpload(
    url: string,
    file: File,
    authHeaders: { [k: string]: string },
    extras?: { [k: string]: string },
    sub?: BehaviorSubject<number>
): Promise<void> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let currentPointer = 0;
    let currentChunk = 0;
    const uploadId = shortid.generate();

    /* eslint-disable no-await-in-loop */
    // We need to process sequentially thus await in a loop
    while (currentPointer < file.size) {
        const fd = new FormData();
        if (extras) {
            for (const extra of Object.keys(extras)) {
                fd.append(extra, extras[extra]);
            }
        }
        fd.append('upload_id', uploadId);
        fd.append('file_total_size', `${file.size}`);
        fd.append('file_chunk_offset', `${currentPointer}`);
        fd.append('file_chunk_index', `${currentChunk}`);
        fd.append('file_total_chunks', `${totalChunks}`);
        fd.append('file', new File([file.slice(currentPointer, currentPointer + CHUNK_SIZE)], file.name));

        try {
            const res = await fetch(url, {
                body: fd,
                headers: { ...authHeaders, Accept: 'application/json' },
                method: HTTP_METHOD.POST,
            });
            await validateResponse(res, `Failed to upload file: ${file.name}`);
            if (sub) {
                sub.next(Math.round(((currentChunk + 1) / totalChunks) * 100));
            }
            currentPointer += CHUNK_SIZE;
            currentChunk += 1;
        } catch (err) {
            if (sub) {
                sub.error(err.message);
            } else {
                throw err;
            }
            break;
        }
    }
    /* eslint-enable no-await-in-loop */
}
