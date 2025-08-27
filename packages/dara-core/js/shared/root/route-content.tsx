import * as React from 'react';
import { type LoaderFunctionArgs, useLoaderData } from 'react-router';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api';
import { handleAuthErrors } from '@/auth';
import type { ComponentInstance, NormalizedPayload, RouteDefinition } from '@/types';

import DynamicComponent from '../dynamic-component/dynamic-component';
import { denormalize } from '../utils/normalization';

export function createRouteLoader(route: RouteDefinition) {
    return async function loader({ request: loaderRequest }: LoaderFunctionArgs) {
        const response = await request('/api/core/route', {
            method: HTTP_METHOD.POST,
            body: JSON.stringify({
                id: route.id,
            }),
            // ensures loader requests are cancelled if user changes their mind
            signal: loaderRequest.signal,
        });
        await handleAuthErrors(response, true);
        await validateResponse(response, 'Failed to fetch the route data for this app');
        const responseContent: NormalizedPayload<ComponentInstance> = await response.json();
        const template = denormalize(responseContent.data, responseContent.lookup) as ComponentInstance;
        return { template };
    };
}

function RouteContent(): React.ReactNode {
    const { template } = useLoaderData<ReturnType<typeof createRouteLoader>>();
    return <DynamicComponent component={template} />;
}

export default RouteContent;
