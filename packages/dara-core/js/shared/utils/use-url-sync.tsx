/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { type BrowserInterface, type RecoilURLSyncOptions } from 'recoil-sync';

interface UrlSyncOptions {
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
    const location = useLocation();

    const locationSubscribers = useRef<Array<() => void>>([]);

    useEffect(() => {
        for (const subscriber of locationSubscribers.current) {
            subscriber();
        }
    }, [location]);

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
        } catch {
            return val;
        }
    }, []);

    /**
     * Custom URL change listener which utilises the location to listen for changes. This is used by the
     * RecoilURLSync component to listen for changes to the URL and trigger Variables with QueryParamStore updates.
     *
     * This is required as by default the library only listens for 'popstate' events which are not triggered when
     * the URL is changed programmatically via history.push.
     */
    const listenChangeURL = useCallback((handler: () => void): (() => void) => {
        locationSubscribers.current.push(handler);
        return () => {
            locationSubscribers.current = locationSubscribers.current.filter((item) => item !== handler);
        };
    }, []);

    // TODO: figure out testing setup with RR v7
    // overrides for memory mode
    // const memoryOptions: BrowserInterface = {
    //     getURL: () => {
    //         return window.location.origin + options.history.location.pathname + options.history.location.search;
    //     },
    //     pushURL: (url: string) => {
    //         options.history.push(url.replace(window.location.origin, ''));
    //     },
    //     replaceURL: (url: string) => {
    //         options.history.replace(url.replace(window.location.origin, ''));
    //     },
    // };

    return {
        browserInterface: {
            listenChangeURL,
            // ...(options.memory_TEST ? memoryOptions : {}),
        },
        deserialize: urlDeserializer,
        location: { part: 'queryParams' },
        serialize: urlSerializer,
    };
}
