import { act, render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import * as React from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { useRecoilSnapshot } from 'recoil';

import { useLatestRef } from '@darajs/ui-utils';

import { setSessionToken } from '@/auth';
import { createRoute } from '@/router/create-router';
import { ResponseChunk } from '@/router/fetching';
import { clearRegistries_TEST, useVariable } from '@/shared';
import DynamicComponent, { clearCaches_TEST } from '@/shared/dynamic-component/dynamic-component';
import { preloadActions } from '@/shared/interactivity/use-action';
import {
    type AnnotatedAction,
    type ComponentInstance,
    ComponentType,
    type DerivedVariable,
    type JsComponent,
    type PyComponentInstance,
    type RouteDefinition,
    type SingleVariable,
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
        vi.restoreAllMocks();
        setSessionToken(TEST_TOKEN);

        // mock successful verification
        server.use(
            http.post('/api/auth/verify-session', () => {
                return HttpResponse.json(TEST_TOKEN);
            })
        );
    });
    afterEach(() => {
        server.resetHandlers();
        act(() => {
            setSessionToken(null);
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
            const snapshot = useRecoilSnapshot();
            const snapshotRef = useLatestRef(snapshot);
            const [parsedRoute] = React.useState(() => createRoute(route, snapshotRef, new Map()));
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
            const snapshot = useRecoilSnapshot();
            const snapshotRef = useLatestRef(snapshot);
            const [varValue] = useVariable(inputVar);
            const [parsedRoute] = React.useState(() => createRoute(route, snapshotRef, new Map()));
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
            const snapshot = useRecoilSnapshot();
            const snapshotRef = useLatestRef(snapshot);
            const [parsedRoute] = React.useState(() => createRoute(route, snapshotRef, new Map()));
            return (
                <>
                    <RouterProvider router={createBrowserRouter([parsedRoute])} />
                </>
            );
        }

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => (
                <Wrapper
                    withRouter={false}
                    importersObject={{
                        ...importers,
                        test: () =>
                            Promise.resolve({
                                TestDisplay,
                            }),
                    }}
                    componentsRegistry={{
                        ...mockComponents,
                        TestDisplay: {
                            js_module: 'test',
                            name: 'TestDisplay',
                            py_module: 'test',
                            type: ComponentType.JS,
                        } as JsComponent,
                    }}
                >
                    {props.children}
                </Wrapper>
            ),
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
            const snapshot = useRecoilSnapshot();
            const snapshotRef = useLatestRef(snapshot);
            const [parsedRoute] = React.useState(() => createRoute(route, snapshotRef, new Map()));
            return (
                <>
                    <RouterProvider router={createBrowserRouter([parsedRoute])} />
                </>
            );
        }

        const container = render(<Root />, {
            wrapper: (props: { children: React.ReactNode }) => (
                <Wrapper
                    withRouter={false}
                    importersObject={{
                        ...importers,
                        test: () =>
                            Promise.resolve({
                                TestDisplay,
                                Text: () => <div>Text</div>,
                            }),
                    }}
                    componentsRegistry={{
                        ...mockComponents,
                        TestDisplay: {
                            js_module: 'test',
                            name: 'TestDisplay',
                            py_module: 'test',
                            type: ComponentType.JS,
                        } as JsComponent,
                        Text: {
                            js_module: 'test',
                            name: 'Text',
                            py_module: 'test',
                            type: ComponentType.JS,
                        },
                        TestPyComponent: {
                            name: 'TestPyComponent',
                            type: ComponentType.PY,
                        },
                    }}
                >
                    {props.children}
                </Wrapper>
            ),
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
});
