/* eslint-disable no-restricted-globals */
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { nanoid } from 'nanoid';
import * as React from 'react';
import { Outlet, RouterProvider, createBrowserRouter, useNavigate } from 'react-router';

import { setSessionToken } from '@/auth/use-session-token';
import type { LoaderResult } from '@/router';
import { clearRegistries_TEST, useVariable } from '@/shared';
import { PathParamSync } from '@/shared/interactivity/persistence';
import type { PathParamStore, SingleVariable } from '@/types/core';

import { Wrapper } from './utils';

const SESSION_TOKEN = 'TEST_TOKEN';

function createPathVariable(param: string): SingleVariable<any, PathParamStore> {
    return {
        __typename: 'Variable',
        default: null,
        store: {
            __typename: '_PathParamStore',
            param_name: param,
        },
        uid: nanoid(),
        nested: [],
    } as SingleVariable<any, PathParamStore>;
}

describe('Path Param Variable', () => {
    beforeEach(() => {
        setSessionToken(SESSION_TOKEN);
        vi.restoreAllMocks();
        clearRegistries_TEST();
    });
    afterEach(() => {
        setSessionToken(null);
    });

    it('should initialize from the path param', async () => {
        act(() => {
            history.pushState(null, '', '/blog/123');
        });

        const variable = createPathVariable('id');

        const Harness = (): React.ReactNode => {
            const [value] = useVariable(variable);
            return <div data-testid="value">{value}</div>;
        };

        const router = createBrowserRouter([
            {
                element: (
                    <PathParamSync>
                        <Outlet />
                    </PathParamSync>
                ),
                children: [
                    {
                        path: 'blog/:id',
                        element: <Harness />,
                    },
                ],
            },
        ]);

        const { getByTestId } = render(<RouterProvider router={router} />, {
            wrapper: ({ children }) => <Wrapper withRouter={false}>{children}</Wrapper>,
        });

        await waitFor(() => {
            expect(getByTestId('value')).toHaveTextContent('123');
        });
    });

    it('should access multiple child and parent path params', async () => {
        act(() => {
            history.pushState(null, '', '/a/123/b/456/c/789/d/101');
        });

        const variableA = createPathVariable('a');
        const variableB = createPathVariable('b');
        const variableC = createPathVariable('c');
        const variableD = createPathVariable('d');

        const Harness = (): React.ReactNode => {
            const [valueA] = useVariable(variableA);
            const [valueB] = useVariable(variableB);
            const [valueC] = useVariable(variableC);
            const [valueD] = useVariable(variableD);

            return (
                <div data-testid="value">
                    {valueA}/{valueB}/{valueC}/{valueD}
                </div>
            );
        };

        const router = createBrowserRouter([
            {
                element: (
                    <PathParamSync>
                        <Outlet />
                    </PathParamSync>
                ),
                children: [
                    {
                        path: 'a/:a/b/:b',
                        children: [
                            {
                                path: 'c/:c/d/:d',
                                element: <Harness />,
                            },
                        ],
                    },
                ],
            },
        ]);

        const { getByTestId } = render(<RouterProvider router={router} />, {
            wrapper: ({ children }) => <Wrapper withRouter={false}>{children}</Wrapper>,
        });

        await waitFor(() => {
            expect(getByTestId('value')).toHaveTextContent('123/456/789/101');
        });
    });

    it('should update when the path param changes', async () => {
        act(() => {
            history.pushState(null, '', '/blog/123');
        });

        const variable = createPathVariable('id');

        const Harness = (): React.ReactNode => {
            const [value] = useVariable(variable);
            const navigate = useNavigate();
            return (
                <div>
                    <div data-testid="value">{value}</div>
                    <button type="button" data-testid="navigate" onClick={() => navigate('/blog/456')}>
                        navigate
                    </button>
                </div>
            );
        };

        const router = createBrowserRouter([
            {
                element: (
                    <PathParamSync>
                        <Outlet />
                    </PathParamSync>
                ),
                children: [
                    {
                        path: 'blog/:id',
                        element: <Harness />,
                    },
                ],
            },
        ]);

        const { getByTestId } = render(<RouterProvider router={router} />, {
            wrapper: ({ children }) => <Wrapper withRouter={false}>{children}</Wrapper>,
        });

        await waitFor(() => {
            expect(getByTestId('value')).toHaveTextContent('123');
        });

        fireEvent.click(getByTestId('navigate'));

        await waitFor(() => {
            expect(getByTestId('value')).toHaveTextContent('456');
        });
    });

    it('should update URL when the variable is updated', async () => {
        act(() => {
            history.pushState(null, '', '/blog/123');
        });

        const variable = createPathVariable('id');

        const Harness = (): React.ReactNode => {
            const [value, setValue] = useVariable(variable);
            return (
                <div>
                    <div data-testid="value">{value}</div>
                    <button type="button" data-testid="set-value" onClick={() => setValue('456')}>
                        set value
                    </button>
                </div>
            );
        };

        const router = createBrowserRouter([
            {
                element: (
                    <PathParamSync>
                        <Outlet />
                    </PathParamSync>
                ),
                children: [
                    {
                        path: 'blog/:id',
                        element: <Harness />,
                        loader: (): LoaderResult => {
                            // data expected by our sync to be a route definition
                            return {
                                data: {
                                    route_definition: {
                                        full_path: '/blog/:id',
                                        path: '/blog/:id',
                                        id: 'blog/:id',
                                        case_sensitive: false,
                                        __typename: 'PageRoute',
                                        children: [],
                                    },
                                    on_load: [],
                                    template: null as any,
                                },
                            };
                        },
                    },
                ],
            },
        ]);

        const { getByTestId } = render(<RouterProvider router={router} />, {
            wrapper: ({ children }) => <Wrapper withRouter={false}>{children}</Wrapper>,
        });

        await waitFor(() => {
            expect(getByTestId('value')).toHaveTextContent('123');
        });

        fireEvent.click(getByTestId('set-value'));

        await waitFor(() => {
            expect(location.pathname).toBe('/blog/456');
        });
    });
});
