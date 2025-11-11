import NProgress from 'nprogress';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { Outlet, useMatches, useNavigation } from 'react-router';
import { RecoilURLSync } from 'recoil-sync';

import { ThemeProvider } from '@darajs/styled-components';

import { GlobalStyle } from '@/global-styles';
import { useRouterContext } from '@/router/context';
import type { RouteMatch } from '@/types';

import { useConfig } from '../context/config-context';
import { useVariable } from '../interactivity';
import { PathParamSync } from '../interactivity/persistence';
import { resolveTheme } from '../utils';
import useUrlSync from '../utils/use-url-sync';

function StyleRoot(props: { children: ReactNode }): JSX.Element {
    const config = useConfig();
    const [mainTheme] = useVariable(config.theme.main);
    const theme = useMemo(() => resolveTheme(mainTheme, config.theme.base), [config.theme.base, mainTheme]);

    return (
        <ThemeProvider theme={theme}>
            <GlobalStyle />
            {props.children}
        </ThemeProvider>
    );
}

function MatchesSync(props: { children: ReactNode }): ReactNode {
    const routerCtx = useRouterContext();
    const matches = useMatches();
    const [routerMatches, setRouteMatchesVar] = useVariable(routerCtx.routeMatches);

    useEffect(() => {
        const daraMatches = matches
            .filter((m) => routerCtx.routeDefMap.has(m.id))
            .map((m) => {
                const routeDef = routerCtx.routeDefMap.get(m.id)!;

                return {
                    id: m.id,
                    pathname: m.pathname,
                    params: m.params,
                    definition: routeDef,
                } satisfies RouteMatch;
            }) satisfies RouteMatch[];
        setRouteMatchesVar(daraMatches);
    }, [matches, routerCtx.routeDefMap]);

    return props.children;
}

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
                <StyleRoot>
                    <MatchesSync>
                        <Outlet />
                    </MatchesSync>
                </StyleRoot>
            </RecoilURLSync>
        </PathParamSync>
    );
}

export default UnauthenticatedRoot;
