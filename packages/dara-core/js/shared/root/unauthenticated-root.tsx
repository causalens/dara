import NProgress from 'nprogress';
import { useEffect, useRef } from 'react';
import { Outlet, useNavigation } from 'react-router';
import { RecoilURLSync } from 'recoil-sync';

import { PathParamSync } from '../interactivity/persistence';
import useUrlSync from '../utils/use-url-sync';

/**
 * Rendered around the entire router content, regardless of whether it's the authenticated content
 * or e.g. auth pages
 */
function UnauthenticatedRoot(): JSX.Element {
    const syncOptions = useUrlSync();
    const navigation = useNavigation();

    const progressRef = useRef<boolean>(false);
    const progressTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // create a bar when state becomes loading or submitting
        if (!progressRef.current && (navigation.state === 'loading' || navigation.state === 'submitting')) {
            progressTimeout.current = setTimeout(() => NProgress.start(), 250);
            progressRef.current = true;
        }

        // if there is a bar and we're idle, mark it as done
        if (progressRef.current && navigation.state === 'idle') {
            if (progressTimeout.current) {
                clearTimeout(progressTimeout.current);
                progressTimeout.current = null;
            }
            progressRef.current = false;
            if (NProgress.isStarted()) {
                NProgress.done();
            }
        }
    }, [navigation.state]);

    return (
        <PathParamSync>
            <RecoilURLSync {...syncOptions}>
                <Outlet />
            </RecoilURLSync>
        </PathParamSync>
    );
}

export default UnauthenticatedRoot;
