/* eslint-disable react-hooks/exhaustive-deps */
import type * as BokehLib from '@bokeh/bokehjs/build/js/lib';
import type { DocJson } from '@bokeh/bokehjs/build/js/lib/document';
import { useEffect, useId, useMemo, useState } from 'react';

import {
    type Action,
    DefaultFallback,
    type StyledComponentProps,
    injectCss,
    useAction,
    useComponentStyles,
} from '@darajs/core';
import styled from '@darajs/styled-components';

const BOKEH_LIBRARIES = [
    'https://cdn.bokeh.org/bokeh/release/bokeh-{version}.min.js',
    'https://cdn.bokeh.org/bokeh/release/bokeh-widgets-{version}.min.js',
    'https://cdn.bokeh.org/bokeh/release/bokeh-tables-{version}.min.js',
    'https://cdn.bokeh.org/bokeh/release/bokeh-api-{version}.min.js',
    'https://cdn.bokeh.org/bokeh/release/bokeh-gl-{version}.min.js',
    'https://cdn.bokeh.org/bokeh/release/bokeh-mathjax-{version}.min.js',
];

const BokehRoot = injectCss(styled.div`
    display: flex;
    flex: 1 1 auto;
`);

interface BokehProps extends StyledComponentProps {
    document: string;
    events?: [string, Action][];
}

const createEventName = (baseEventName: string, figId: string): string => `BOKEH_FIGURE_${baseEventName}_${figId}`;

declare global {
    interface Window {
        /**
         * Bokeh library
         */
        Bokeh: typeof BokehLib;
        /**
         * Whether Bokeh is currently loading; this is set on window so that multiple Bokeh components
         * won't try to load Bokeh at the same time
         */
        bokehLoading?: boolean;
    }
}

/* eslint-disable no-underscore-dangle */
/**
 * A component for displaying a serialized Bokeh Document. Takes a Bokeh Document that has been serialized
 * to a JSON string.
 *
 * @param {BokehProps} props - the component props
 */
function Bokeh(props: BokehProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [isLoading, setIsLoading] = useState(true);

    const docJson = useMemo<DocJson>(() => JSON.parse(props.document), [props.document]);
    const rootId = useMemo(() => docJson.roots[0]!.id, [docJson]);
    const id = props.id_ ?? useId();

    const events: [string, (...args: any) => any][] = [];

    const eventActions: [string, (value: any) => Promise<void>][] = [];

    if (props.events) {
        for (let i = 0; i < props.events.length; i++) {
            const [name, action] = props.events[i]!;
            // eslint-disable-next-line react-hooks/rules-of-hooks
            eventActions.push([name, useAction(action)]);
        }
    }

    /**
     * Wait for Bokeh to be available on window
     */
    async function waitForBokeh(): Promise<void> {
        return new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (window.Bokeh) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    function loadBokehLibrary(url: string, version: string): Promise<void> {
        let resolve: () => void;
        const promise = new Promise<void>((r) => {
            resolve = r;
        });
        const script = document.createElement('script');
        script.src = url.replace('{version}', version);
        script.async = true;
        script.onload = () => {
            resolve();
        };
        document.head.appendChild(script);
        return promise;
    }

    async function initializeBokeh(): Promise<void> {
        const bokehVersion = docJson.version!;

        // if it's already loading, wait for it to be available
        if (window.bokehLoading) {
            await waitForBokeh();
        } else if (!window.Bokeh) {
            // otherwise, load it
            const [core, ...libraries] = BOKEH_LIBRARIES;

            // Core needs to be loaded before all the other libraries
            await loadBokehLibrary(core!, bokehVersion);

            await Promise.all(libraries.map((url) => loadBokehLibrary(url, bokehVersion)));
        }

        events.forEach(([ev, handler]) => {
            document.removeEventListener(ev, handler);
        });

        eventActions.forEach(([name, action]) => {
            const handler: EventListener = (e) => {
                action((e as any).detail);
            };

            const evtName = createEventName(name, docJson.roots[0]!.id);
            document.addEventListener(evtName, handler);
            events.push([evtName, handler]);
        });

        if (docJson) {
            window.Bokeh.embed.embed_item({
                doc: docJson,
                root_id: rootId,
                target_id: id,
            });
        }

        setIsLoading(false);
    }

    useEffect(() => {
        initializeBokeh();

        return () => {
            if (!window.Bokeh) {
                return;
            }
            const index = window.Bokeh.documents.findIndex((doc) => doc.roots()[0]!.id === docJson.roots[0]!.id);
            if (index > -1) {
                const doc = window.Bokeh.documents[index]!;
                doc.clear();
                window.Bokeh.documents.splice(index, 1);
            }
        };
    }, [docJson]);

    return (
        <BokehRoot
            $rawCss={css}
            data-root-id={rootId}
            id={id}
            style={{ minHeight: '350px', minWidth: '350px', ...style }}
        >
            {isLoading && (
                <DefaultFallback
                    style={{
                        display: 'flex',
                        flex: '1 1 auto',
                    }}
                />
            )}
        </BokehRoot>
    );
}

export default Bokeh;
