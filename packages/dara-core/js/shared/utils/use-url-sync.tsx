import { History } from 'history';
import { useCallback } from 'react';
import { BrowserInterface, RecoilURLSyncOptions } from 'recoil-sync';

interface UrlSyncOptions {
    /**
     * History object to use
     */
    history?: History;
    /**
     * Whether to use memory history overrides for testing
     */
    memory_TEST?: boolean;
}

/**
 * Setup the URL sync for the application. This is used to sync Recoil state with the URL query params.
 *
 * @param basename router basename
 */
export default function useUrlSync(options: UrlSyncOptions): Omit<RecoilURLSyncOptions, 'children'> {
    /**
     * Custom URL query param serializer. This is used by
     * the RecoilURLSync component to convert a variable value into a URL query param
     */
    const urlSerializer = useCallback((val: any): string => {
        if (val === undefined || val === null) {
            return '';
        }

        if (['string', 'number', 'boolean'].includes(typeof val)) {
            return String(val);
        }

        return JSON.stringify(val);
    }, []);

    /**
     * Custom URL query param deserializer. This is used by
     * the RecoilURLSync component to convert a URL query param into a variable value
     */
    const urlDeserializer = useCallback((val: string): any => {
        if (val === '') {
            return undefined;
        }

        try {
            return JSON.parse(val);
        } catch (e) {
            return val;
        }
    }, []);

    /**
     * Custom URL change listener which utilises the history object to listen for changes. This is used by the
     * RecoilURLSync component to listen for changes to the URL and trigger UrlVariable updates.
     *
     * This is required as by default the library only listens for 'popstate' events which are not triggered when
     * the URL is changed programmatically via history.push.
     */
    const listenChangeURL = useCallback((handler: () => void): (() => void) => {
        const unregister = options.history.listen(() => {
            handler();
        });

        return () => unregister();
    }, []);

    // overrides for memory mode
    const memoryOptions: BrowserInterface = {
        getURL: () => {
            return window.location.origin + options.history.location.pathname + options.history.location.search;
        },
        pushURL: (url: string) => {
            options.history.push(url.replace(window.location.origin, ''));
        },
        replaceURL: (url: string) => {
            options.history.replace(url.replace(window.location.origin, ''));
        },
    };

    return {
        browserInterface: {
            listenChangeURL,
            ...(options.memory_TEST ? memoryOptions : {}),
        },
        deserialize: urlDeserializer,
        location: { part: 'queryParams' },
        serialize: urlSerializer,
    };
}
