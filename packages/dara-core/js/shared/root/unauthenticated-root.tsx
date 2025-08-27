import { Outlet } from 'react-router';
import { RecoilRoot } from 'recoil';
import { RecoilURLSync } from 'recoil-sync';

import { GlobalTaskProvider } from '@/shared/context';

import useUrlSync from '../utils/use-url-sync';

/**
 * Rendered around the entire router content, regardless of whether it's the authenticated content
 * or e.g. auth pages
 */
function UnauthenticatedRoot(): JSX.Element {
    const syncOptions = useUrlSync({});
    return (
        <RecoilRoot>
            <RecoilURLSync {...syncOptions}>
                <GlobalTaskProvider>
                    <Outlet />
                </GlobalTaskProvider>
            </RecoilURLSync>
        </RecoilRoot>
    );
}

export default UnauthenticatedRoot;
