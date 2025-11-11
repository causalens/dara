/* eslint-disable no-restricted-globals */
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { nanoid } from 'nanoid';
import * as React from 'react';
import { Outlet, RouterProvider, createBrowserRouter, useNavigate } from 'react-router';

import { setSessionToken } from '@/auth/use-session-token';
import { RouterContextProvider } from '@/router';
import { clearRegistries_TEST, useVariable } from '@/shared';
import { RouteMatchSync } from '@/shared/interactivity/persistence';
import type { RouteDefinition, RouteMatchStore, SingleVariable } from '@/types/core';

import { Wrapper } from './utils';

const SESSION_TOKEN = 'TEST_TOKEN';

function createRouteMatchesVariable(): SingleVariable<any, RouteMatchStore> {
    return {
        __typename: 'Variable',
        default: null,
        store: {
            __typename: '_RouteMatchStore',
        },
        uid: nanoid(),
        nested: [],
    } as SingleVariable<any, RouteMatchStore>;
}

const postsDefinition: RouteDefinition = {
    path: 'posts/:id',
    id: 'posts_id',
    __typename: 'PageRoute',
    full_path: '/posts/:id',
    case_sensitive: false,
    children: [],
};

const blogDefinition: RouteDefinition = {
    path: 'blog/:id',
    id: 'blog_id',
    __typename: 'PageRoute',
    full_path: '/home/blog/:id',
    case_sensitive: false,
    children: [postsDefinition],
};

const homeDefinition: RouteDefinition = {
    path: 'home',
    id: 'home',
    __typename: 'PageRoute',
    full_path: '/home',
    case_sensitive: false,
    children: [blogDefinition],
};

const definitions: RouteDefinition[] = [homeDefinition];
const definitionMap = new Map<string, RouteDefinition>([
    ['home', homeDefinition],
    ['blog_id', blogDefinition],
    ['posts_id', postsDefinition],
]);

describe('Route Matches Variable', () => {
    beforeEach(() => {
        setSessionToken(SESSION_TOKEN);
        vi.restoreAllMocks();
        clearRegistries_TEST();
    });
    afterEach(() => {
        setSessionToken(null);
    });

    it('should follow current route matches', async () => {
        act(() => {
            history.pushState(null, '', '/home/blog/123');
        });

        const variable = createRouteMatchesVariable();

        const Harness = (): React.ReactNode => {
            const [value] = useVariable(variable);
            const navigate = useNavigate();
            return (
                <div>
                    <div data-testid="value">{JSON.stringify(value, null, 4)}</div>
                    <button type="button" data-testid="navigate" onClick={() => navigate('./posts/234')}>
                        navigate
                    </button>
                    <Outlet />
                </div>
            );
        };

        const router = createBrowserRouter([
            {
                element: (
                    <RouteMatchSync>
                        <Outlet />
                    </RouteMatchSync>
                ),
                children: [
                    {
                        path: 'home',
                        id: 'home',
                        children: [
                            {
                                path: 'blog/:blogId',
                                element: <Harness />,
                                id: 'blog_id',
                                children: [
                                    {
                                        index: true,
                                        element: <div data-testid="index">index</div>,
                                    },
                                    {
                                        path: 'posts/:postId',
                                        element: <div data-testid="posts">posts</div>,
                                        id: 'posts_id',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ]);

        const { getByTestId } = render(
            <RouterContextProvider
                routeDefinitions={definitions}
                routeObjects={[]}
                routeDefMap={definitionMap}
                defaultPath="/"
                routeMatches={variable}
            >
                <RouterProvider router={router} />
            </RouterContextProvider>,
            {
                wrapper: ({ children }) => <Wrapper withRouter={false}>{children}</Wrapper>,
            }
        );

        await waitFor(() => {
            expect(getByTestId('index')).toBeInTheDocument();
            const parsed = JSON.parse(getByTestId('value').textContent!);
            expect(parsed).toEqual([
                expect.objectContaining({ pathname: '/home', id: 'home', definition: homeDefinition }),
                expect.objectContaining({
                    pathname: '/home/blog/123',
                    id: 'blog_id',
                    params: { blogId: '123' },
                    definition: blogDefinition,
                }),
            ]);
        });

        fireEvent.click(getByTestId('navigate'));

        await waitFor(() => {
            expect(getByTestId('posts')).toBeInTheDocument();
            const parsed = JSON.parse(getByTestId('value').textContent!);
            expect(parsed).toEqual([
                // still matches existing route
                expect.objectContaining({ pathname: '/home', id: 'home', definition: homeDefinition }),
                expect.objectContaining({
                    pathname: '/home/blog/123',
                    id: 'blog_id',
                    params: { blogId: '123', postId: '234' },
                    definition: blogDefinition,
                }),
                // also matches the nested route which we navigated to
                expect.objectContaining({
                    pathname: '/home/blog/123/posts/234',
                    id: 'posts_id',
                    params: { blogId: '123', postId: '234' },
                    definition: postsDefinition,
                }),
            ]);
        });
    });
});
