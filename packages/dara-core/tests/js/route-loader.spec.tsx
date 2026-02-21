import { act, render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import * as React from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { useRecoilCallback } from 'recoil';

import { setSessionIdentifier } from '@/auth';
import { createRoute } from '@/router/create-router';
import { ResponseChunk } from '@/router/fetching';
import { clearRegistries_TEST, useVariable } from '@/shared';
import DynamicComponent, { clearCaches_TEST, preloadComponents } from '@/shared/dynamic-component/dynamic-component';
import { clearStreamUsage_TEST } from '@/shared/interactivity/stream-usage-tracker';
import { preloadActions } from '@/shared/interactivity/use-action';
import {
    type AnnotatedAction,
    type ComponentInstance,
    ComponentType,
    type DerivedVariable,
    type PathParamStore,
    type PyComponentInstance,
    type RouteDefinition,
    type SingleVariable,
    type StreamVariable,
    type UpdateVariableImpl,
} from '@/types';

import { Wrapper, server } from './utils';
import { mockActions, mockComponents } from './utils/test-server-handlers';
import { importers } from './utils/wrapped-render';

const TEST_TOKEN = 'TEST_TOKEN';

describe('Route Loader', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(async () => {
        window.localStorage.clear();
        clearRegistries_TEST();
        clearCaches_TEST();
        await preloadActions(importers, Object.values(mockActions));
        await preloadComponents(importers, Object.values(mockComponents));
        vi.restoreAllMocks();
        setSessionIdentifier(TEST_TOKEN);

        // mock successful verification
        server.use(
            http.post('/api/auth/verify-session', () => {
                return HttpResponse.json(TEST_TOKEN);
            })
        );
    });
    afterEach(() => {
        server.resetHandlers();
        clearCaches_TEST();
        clearStreamUsage_TEST();
        act(() => {
            setSessionIdentifier(null);
        });
    });
    afterAll(() => server.close());

    it('loads template data', async () => {
        const route = {
            id: 'test',
            case_sensitive: false,
            index: true,
            full_path: '/test',
            __typename: 'IndexRoute',
        } satisfies RouteDefinition;

        server.use(
            // mock the route loader endpoint
            http.post('/api/core/route/:route_id', () => {
                const stream = new ReadableStream({
                    start(controller) {
                        const te = new TextEncoder();
                        const sendChunk = (x: ResponseChunk): void => {
                            controller.enqueue(te.encode(`${JSON.stringify(x)}\r\n`));
                        };

                        sendChunk({
                            type: 'template',
                            template: {
                                lookup: {},
                                data: {
                                    name: 'TestPropsComponent',
                                    props: {
                                        text: 'Content',
                                    },
                                    uid: 'text-content',
                                } satisfies ComponentInstance,
                            },
                        });
                        // must send at least empty actions since client waits for them
                        sendChunk({
                            type: 'actions',
                            actions: {},
                        });
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'content-type': 'application/x-ndjson',
                    },
                });
            })
        );

        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            return <RouterProvider router={createBrowserRouter([parsedRoute])} />;
        }

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });
        await waitFor(() =>
            expect(
                container.getByText('Content', {
                    exact: false,
                })
            ).toBeVisible()
        );
    });

    it('executes on_load actions', async () => {
        const inputVar: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'test',
            nested: [],
            uid: 'input_uid',
        };

        const route = {
            id: 'test',
            case_sensitive: false,
            index: true,
            full_path: '/test',
            __typename: 'IndexRoute',
            on_load: {
                uid: 'action_uid',
                definition_uid: 'action_definition_uid',
                dynamic_kwargs: {
                    input: inputVar,
                },
                loading: {
                    uid: 'loading_uid',
                    default: false,
                    __typename: 'Variable',
                    nested: [],
                } satisfies SingleVariable<boolean>,
            } satisfies AnnotatedAction,
        } satisfies RouteDefinition;

        server.use(
            // mock the route loader endpoint
            http.post('/api/core/route/:route_id', async (ctx) => {
                // action payload sent, not checking content exactly here
                const body = await ctx.request.json();
                expect(body!.action_payloads).toHaveLength(1);

                const stream = new ReadableStream({
                    start(controller) {
                        const te = new TextEncoder();
                        const sendChunk = (x: ResponseChunk): void => {
                            controller.enqueue(te.encode(`${JSON.stringify(x)}\r\n`));
                        };

                        sendChunk({
                            type: 'template',
                            template: {
                                lookup: {},
                                data: {
                                    name: 'TestPropsComponent',
                                    props: {
                                        text: 'Content',
                                    },
                                    uid: 'text-content',
                                } satisfies ComponentInstance,
                            },
                        });
                        // send back action result we can test
                        sendChunk({
                            type: 'actions',
                            actions: {
                                action_uid: [
                                    {
                                        name: 'UpdateVariable',
                                        __typename: 'ActionImpl',
                                        variable: inputVar,
                                        value: 'test2',
                                    } satisfies UpdateVariableImpl,
                                ],
                            },
                        });
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'content-type': 'application/x-ndjson',
                    },
                });
            })
        );
        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
            const [varValue] = useVariable(inputVar);
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            return (
                <>
                    <RouterProvider router={createBrowserRouter([parsedRoute])} />
                    <div data-testid="content">{varValue}</div>
                </>
            );
        }

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });
        await waitFor(() =>
            expect(
                container.getByText('Content', {
                    exact: false,
                })
            ).toBeVisible()
        );
        // action has run so the input variable should have been updated
        expect(container.getByTestId('content').textContent).toBe('test2');
    });

    it('preloads Derived Variables', async () => {
        const inputVar: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'dv_input_test',
            nested: [],
            uid: 'dv_input_uid',
        };
        const dv = {
            __typename: 'DerivedVariable',
            deps: [inputVar],
            nested: [],
            uid: 'dv_uid',
            variables: [inputVar],
        } as DerivedVariable;

        const route = {
            id: 'test',
            case_sensitive: false,
            index: true,
            full_path: '/test',
            __typename: 'IndexRoute',
            dependency_graph: {
                derived_variables: {
                    [dv.uid]: dv,
                },
                py_components: {},
            },
        } satisfies RouteDefinition;

        const mockDvCall = vi.fn();

        server.use(
            // mock the route loader endpoint
            http.post('/api/core/route/:route_id', async (ctx) => {
                // dv payload sent, not checking content exactly here
                const body = await ctx.request.json();
                expect(body!.derived_variable_payloads).toHaveLength(1);

                const stream = new ReadableStream({
                    start(controller) {
                        const te = new TextEncoder();
                        const sendChunk = (x: ResponseChunk): void => {
                            controller.enqueue(te.encode(`${JSON.stringify(x)}\r\n`));
                        };

                        sendChunk({
                            type: 'template',
                            template: {
                                lookup: {},
                                // render our custom component
                                data: {
                                    name: 'TestDisplay',
                                    props: {},
                                    uid: 'test-content',
                                } satisfies ComponentInstance,
                            },
                        });
                        sendChunk({
                            type: 'actions',
                            actions: {},
                        });
                        sendChunk({
                            type: 'derived_variable',
                            uid: dv.uid,
                            result: {
                                ok: true,
                                value: { cache_key: 'foo', value: 'DV RESULT' },
                            },
                        });
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'content-type': 'application/x-ndjson',
                    },
                });
            }),
            http.post('/api/core/derived-variable/:uid', () => {
                // Should not be called, DV is loaded by the route loader
                mockDvCall();
            })
        );
        function DvDisplay(): JSX.Element {
            const [dvValue] = useVariable(dv);
            return <div data-testid="content">{dvValue}</div>;
        }
        function TestDisplay(): JSX.Element {
            return (
                <>
                    Content
                    <React.Suspense fallback={<div>Loading DV</div>}>
                        <DvDisplay />
                    </React.Suspense>
                </>
            );
        }
        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            return (
                <>
                    <RouterProvider router={createBrowserRouter([parsedRoute])} />
                </>
            );
        }

        await preloadComponents(
            {
                test_mod: () =>
                    Promise.resolve({
                        TestDisplay,
                    }),
            },
            [
                {
                    js_module: 'test',
                    name: 'TestDisplay',
                    py_module: 'test_mod',
                    type: ComponentType.JS,
                },
            ]
        );

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });
        await waitFor(() =>
            expect(
                container.getByText('Content', {
                    exact: false,
                })
            ).toBeVisible()
        );
        await waitFor(() => expect(container.getByTestId('content').textContent).toBe('DV RESULT'));
        expect(mockDvCall).not.toHaveBeenCalled();
    });

    it('preloads py_components', async () => {
        const inputVar: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'dv_input_test',
            nested: [],
            uid: 'dv_input_uid',
        };

        const pyComponent: PyComponentInstance = {
            uid: 'py_comp_uid',
            name: 'TestPyComponent',
            props: {
                dynamic_kwargs: {
                    input_val: inputVar,
                },
                func_name: 'TestComponent',
                js_module: '@test',
                polling_interval: null,
            },
        };

        const route = {
            id: 'test',
            case_sensitive: false,
            index: true,
            full_path: '/test',
            __typename: 'IndexRoute',
            dependency_graph: {
                derived_variables: {},
                py_components: {
                    py_comp_uid: pyComponent,
                },
            },
        } satisfies RouteDefinition;

        const mockPyCall = vi.fn();

        server.use(
            // mock the route loader endpoint
            http.post('/api/core/route/:route_id', async (ctx) => {
                // py_comp payload sent, not checking content exactly here
                const body = await ctx.request.json();
                expect(body!.py_component_payloads).toHaveLength(1);

                const stream = new ReadableStream({
                    start(controller) {
                        const te = new TextEncoder();
                        const sendChunk = (x: ResponseChunk): void => {
                            controller.enqueue(te.encode(`${JSON.stringify(x)}\r\n`));
                        };

                        sendChunk({
                            type: 'template',
                            template: {
                                lookup: {},
                                // render our custom component
                                data: {
                                    name: 'TestDisplay',
                                    props: {},
                                    uid: 'test-content',
                                } satisfies ComponentInstance,
                            },
                        });
                        sendChunk({
                            type: 'actions',
                            actions: {},
                        });
                        sendChunk({
                            type: 'py_component',
                            uid: 'py_comp_uid',
                            result: {
                                ok: true,
                                // render text
                                value: {
                                    data: {
                                        name: 'Text',
                                        props: {},
                                        uid: 'text-content',
                                    } satisfies ComponentInstance,
                                    lookup: {},
                                },
                            },
                        });
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'content-type': 'application/x-ndjson',
                    },
                });
            }),
            http.post('/api/core/component/:uid', () => {
                // Should not be called, Py is loaded by the route loader
                mockPyCall();
            })
        );
        function PyDisplay(): JSX.Element {
            return (
                <div data-testid="content">
                    <DynamicComponent component={pyComponent} />
                </div>
            );
        }
        function TestDisplay(): JSX.Element {
            return (
                <>
                    Content
                    <React.Suspense fallback={<div>Loading PY</div>}>
                        <PyDisplay />
                    </React.Suspense>
                </>
            );
        }
        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            return (
                <>
                    <RouterProvider router={createBrowserRouter([parsedRoute])} />
                </>
            );
        }

        // setup the importers and components
        await preloadComponents(
            {
                test_mod: () =>
                    Promise.resolve({
                        TestDisplay,
                        Text: () => <div>Text</div>,
                    }),
            },
            [
                {
                    js_module: 'test',
                    name: 'TestDisplay',
                    py_module: 'test_mod',
                    type: ComponentType.JS,
                },
                {
                    js_module: 'test',
                    name: 'Text',
                    py_module: 'test_mod',
                    type: ComponentType.JS,
                },
            ]
        );

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });
        await waitFor(() =>
            expect(
                container.getByText('Content', {
                    exact: false,
                })
            ).toBeVisible()
        );
        // rendered Text returned by py_component
        await waitFor(() => expect(container.getByTestId('content').textContent).toBe('Text'));
        expect(mockPyCall).not.toHaveBeenCalled();
    });

    it('resolves variables correctly', async () => {
        const paramVar: SingleVariable<string> = {
            __typename: 'Variable',
            default: '_unused_default',
            nested: [],
            uid: 'param_var_uid',
            store: {
                __typename: '_PathParamStore',
                param_name: 'test_id',
            } as PathParamStore,
        };

        const existingVar: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'existing_var',
            nested: [],
            uid: 'existing_var_uid',
        };

        const defaultVar: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'default_var',
            nested: [],
            uid: 'default_var_uid',
        };

        const testDv: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [paramVar, existingVar, defaultVar],
            nested: [],
            uid: 'test_dv_uid',
            variables: [existingVar, paramVar, defaultVar],
        };

        const pyComponent: PyComponentInstance = {
            uid: 'py_comp_uid',
            name: 'TestPyComponent',
            props: {
                dynamic_kwargs: {
                    input_val: testDv,
                },
                func_name: 'TestComponent',
                js_module: '@test',
                polling_interval: null,
            },
        };

        const route = {
            id: 'test',
            case_sensitive: false,
            path: '/test/:test_id',
            full_path: '/test/:test_id',
            __typename: 'PageRoute',
            dependency_graph: {
                derived_variables: {},
                py_components: {
                    py_comp_uid: pyComponent,
                },
            },
            children: [],
        } satisfies RouteDefinition;

        const mockPyCall = vi.fn();
        const routeCall = vi.fn();

        server.use(
            // mock the route loader endpoint
            http.post('/api/core/route/:route_id', async (ctx) => {
                const body = await ctx.request.json();
                routeCall(body);

                // skipping implementation, just checking the body here
            }),
            http.post('/api/core/component/:uid', () => {
                // Should not be called, Py is loaded by the route loader
                mockPyCall();
            })
        );

        // prenavigate to the route with a param
        window.history.pushState(null, '', '/test/123');

        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback(
                ({ snapshot }) =>
                    () => {
                        return snapshot;
                    },
                []
            );
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            const [existingVal, setExistingVal] = useVariable(existingVar);

            React.useEffect(() => {
                setExistingVal('NEW_EXISTING_VALUE');
            }, [setExistingVal]);

            // wait until the value changes from the default
            if (existingVal === 'existing_var') {
                return <div>Loading</div>;
            }

            return (
                <>
                    <RouterProvider router={createBrowserRouter([parsedRoute])} />
                </>
            );
        }

        render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });
        await waitFor(() => expect(routeCall).toHaveBeenCalled());
        expect(routeCall).toHaveBeenCalledWith(
            expect.objectContaining({
                py_component_payloads: [
                    {
                        uid: 'py_comp_uid',
                        name: 'TestPyComponent',
                        values: {
                            data: {
                                input_val: {
                                    type: 'derived',
                                    uid: 'test_dv_uid',
                                    values: [
                                        {
                                            __ref: 'Variable:existing_var_uid',
                                        },
                                        {
                                            __ref: 'Variable:param_var_uid',
                                        },
                                        {
                                            __ref: 'Variable:default_var_uid',
                                        },
                                    ],
                                    force_key: null,
                                    nested: [],
                                },
                            },
                            lookup: {
                                // Variable doesn't exist yet, uses default
                                'Variable:default_var_uid': 'default_var',
                                // Variable has a value in store, uses that
                                'Variable:existing_var_uid': 'NEW_EXISTING_VALUE',
                                // PathParamStore attached: this uses the param from URL
                                // rather than the default or null
                                'Variable:param_var_uid': '123',
                            },
                        },
                    },
                ],
            })
        );
        expect(mockPyCall).not.toHaveBeenCalled();
    });

    it('skips preloading DVs that depend on StreamVariable', async () => {
        // Reset browser location to root
        window.history.pushState(null, '', '/');

        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'stream_var_uid',
            nested: [],
            variables: [],
            key_accessor: 'id',
        };

        const dv: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [streamVar],
            nested: [],
            uid: 'dv_uid',
            variables: [streamVar],
        };

        const route = {
            id: 'test',
            case_sensitive: false,
            index: true,
            full_path: '/test',
            __typename: 'IndexRoute',
            dependency_graph: {
                derived_variables: {
                    [dv.uid]: dv,
                },
                py_components: {},
            },
        } satisfies RouteDefinition;

        const routeCall = vi.fn();

        server.use(
            http.post('/api/core/route/:route_id', async (ctx) => {
                const body = await ctx.request.json();
                routeCall(body);

                const stream = new ReadableStream({
                    start(controller) {
                        const te = new TextEncoder();
                        const sendChunk = (x: ResponseChunk): void => {
                            controller.enqueue(te.encode(`${JSON.stringify(x)}\r\n`));
                        };

                        sendChunk({
                            type: 'template',
                            template: {
                                lookup: {},
                                data: {
                                    name: 'TestDisplay',
                                    props: {},
                                    uid: 'test-content',
                                } satisfies ComponentInstance,
                            },
                        });
                        sendChunk({
                            type: 'actions',
                            actions: {},
                        });
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'content-type': 'application/x-ndjson',
                    },
                });
            })
        );

        function TestDisplay(): JSX.Element {
            return <div data-testid="content">Content</div>;
        }

        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            return <RouterProvider router={createBrowserRouter([parsedRoute])} />;
        }

        await preloadComponents(
            {
                test_mod: () => Promise.resolve({ TestDisplay }),
            },
            [{ js_module: 'test', name: 'TestDisplay', py_module: 'test_mod', type: ComponentType.JS }]
        );

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });

        await waitFor(() => expect(container.getByTestId('content')).toBeVisible());

        // DV with StreamVariable dependency should be skipped - no payload sent
        expect(routeCall).toHaveBeenCalledWith(
            expect.objectContaining({
                derived_variable_payloads: [],
            })
        );
    });

    it('skips preloading py_components that depend on StreamVariable', async () => {
        // Reset browser location to root
        window.history.pushState(null, '', '/');

        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'stream_var_uid',
            nested: [],
            variables: [],
            key_accessor: 'id',
        };

        const pyComponent: PyComponentInstance = {
            uid: 'py_comp_uid',
            name: 'TestPyComponent',
            props: {
                dynamic_kwargs: {
                    stream_input: streamVar,
                },
                func_name: 'TestComponent',
                js_module: '@test',
                polling_interval: null,
            },
        };

        const route = {
            id: 'test',
            case_sensitive: false,
            index: true,
            full_path: '/test',
            __typename: 'IndexRoute',
            dependency_graph: {
                derived_variables: {},
                py_components: {
                    py_comp_uid: pyComponent,
                },
            },
        } satisfies RouteDefinition;

        const routeCall = vi.fn();

        server.use(
            http.post('/api/core/route/:route_id', async (ctx) => {
                const body = await ctx.request.json();
                routeCall(body);

                const stream = new ReadableStream({
                    start(controller) {
                        const te = new TextEncoder();
                        const sendChunk = (x: ResponseChunk): void => {
                            controller.enqueue(te.encode(`${JSON.stringify(x)}\r\n`));
                        };

                        sendChunk({
                            type: 'template',
                            template: {
                                lookup: {},
                                data: {
                                    name: 'TestDisplay',
                                    props: {},
                                    uid: 'test-content',
                                } satisfies ComponentInstance,
                            },
                        });
                        sendChunk({
                            type: 'actions',
                            actions: {},
                        });
                        controller.close();
                    },
                });

                return new HttpResponse(stream, {
                    headers: {
                        'content-type': 'application/x-ndjson',
                    },
                });
            })
        );

        function TestDisplay(): JSX.Element {
            return <div data-testid="content">Content</div>;
        }

        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            return <RouterProvider router={createBrowserRouter([parsedRoute])} />;
        }

        await preloadComponents(
            {
                test_mod: () => Promise.resolve({ TestDisplay }),
            },
            [{ js_module: 'test', name: 'TestDisplay', py_module: 'test_mod', type: ComponentType.JS }]
        );

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });

        await waitFor(() => expect(container.getByTestId('content')).toBeVisible());

        // py_component with StreamVariable dependency should be skipped - no payload sent
        expect(routeCall).toHaveBeenCalledWith(
            expect.objectContaining({
                py_component_payloads: [],
            })
        );
    });

    it('throws error when on_load action uses StreamVariable', async () => {
        // Reset browser location to root
        window.history.pushState(null, '', '/');

        const streamVar: StreamVariable = {
            __typename: 'StreamVariable',
            uid: 'stream_var_uid',
            nested: [],
            variables: [],
            key_accessor: 'id',
        };

        const loadingVar: SingleVariable<boolean> = {
            __typename: 'Variable',
            default: false,
            nested: [],
            uid: 'loading_var_uid',
        };

        const onLoadAction: AnnotatedAction = {
            definition_uid: 'test_action_def',
            uid: 'test_action',
            dynamic_kwargs: {
                stream_input: streamVar,
            },
            loading: loadingVar,
        };

        const route = {
            id: 'test',
            case_sensitive: false,
            index: true,
            full_path: '/test',
            __typename: 'IndexRoute',
            on_load: onLoadAction,
            dependency_graph: {
                derived_variables: {},
                py_components: {},
            },
        } satisfies RouteDefinition;

        function Root(): JSX.Element {
            const getSnapshot = useRecoilCallback((ctx) => () => ctx.snapshot, []);
            const [parsedRoute] = React.useState(() => createRoute(route, getSnapshot, new Map()));
            return <RouterProvider router={createBrowserRouter([parsedRoute])} />;
        }

        // Suppress console.error for this test since we expect an error
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => <Wrapper withRouter={false}>{props.children}</Wrapper>,
        });

        // Should show error boundary - either generic or specific depending on build mode
        // The key assertion is that the error was thrown and caught
        await waitFor(() => {
            // Check for any error indication - could be "Unexpected error" (prod) or "Unknown error" (dev)
            const errorElement = container.queryByText(/Unexpected error/i) || container.queryByText(/Unknown error/i);
            expect(errorElement).toBeInTheDocument();
        });

        // Verify the error was logged (contains our message about StreamVariable)
        expect(consoleSpy).toHaveBeenCalled();
        const errorCalls = consoleSpy.mock.calls.flat();
        const hasStreamVarError = errorCalls.some(
            (call) => call instanceof Error && call.message.includes('StreamVariable')
        );
        expect(hasStreamVarError).toBe(true);

        consoleSpy.mockRestore();
    });
});
