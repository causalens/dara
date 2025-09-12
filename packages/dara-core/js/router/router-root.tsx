import { useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import { useRecoilCallback } from 'recoil';

import type { DaraData } from '@/types';

import { RouterContextProvider } from './context';
import { createRouter } from './create-router';

interface RouterRootProps {
    daraData: DaraData;
}

function RouterRoot({ daraData }: RouterRootProps): JSX.Element {
    const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
    const [routerData] = useState(() => createRouter(daraData, getSnapshot));

    return (
        <RouterContextProvider
            routeDefinitions={routerData.routeDefinitions}
            routeObjects={routerData.routeObjects}
            routeDefMap={routerData.routeDefMap}
            defaultPath={routerData.defaultPath}
        >
            <RouterProvider router={routerData.router} />
        </RouterContextProvider>
    );
}

export default RouterRoot;
