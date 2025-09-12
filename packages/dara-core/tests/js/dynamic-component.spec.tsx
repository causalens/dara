import { fireEvent, queryByAttribute, waitFor } from '@testing-library/dom';
import { act } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import * as React from 'react';

import { FallbackCtx } from '@/shared/context';
import { EventCapturer } from '@/shared/event-bus/event-bus';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import { preloadActions } from '@/shared/interactivity/use-action';

import { DynamicComponent, useAction, useVariable } from '../../js/shared';
import { type Action, type DerivedVariable, type SingleVariable, type Variable } from '../../js/types';
import { type DaraEventMap, type TriggerVariableImpl } from '../../js/types/core';
import { server, wrappedRender } from './utils';
import { mockActions } from './utils/test-server-handlers';
import { importers } from './utils/wrapped-render';

describe('DynamicComponent', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(async () => {
        // This is necessary to avoid data bleeding between tests
        // Though this causes warnings about duplicate atoms in the test console
        clearRegistries_TEST();

        await preloadActions(importers, Object.values(mockActions));
    });
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    it("should load the component from the registry and render it if it's a JS one", async () => {
        const { container } = wrappedRender(
            <DynamicComponent component={{ name: 'TestComponent', props: {}, uid: 'uid' }} />
        );
        await waitFor(() => expect(container.firstChild).not.toBe(null));
        expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
    });

    it('should render nothing if the component is null', async () => {
        const { container } = wrappedRender(<DynamicComponent component={null} />);
        await waitFor(() => expect(container.firstChild).toBe(null));
    });

    it('should render nothing if the component is undefined', async () => {
        const { container } = wrappedRender(<DynamicComponent component={undefined} />);
        await waitFor(() => expect(container.firstChild).toBe(null));
    });

    it('should update content when "component" prop changes', async () => {
        const initialComponent = {
            name: 'TestPropsComponent',
            props: {
                foo: 'bar',
            },
            uid: 'uid',
        };
        const { getByTestId, rerender } = wrappedRender(
            <div data-testid="wrapper">
                <DynamicComponent component={initialComponent} />
            </div>
        );
        await waitFor(() =>
            expect(JSON.parse(getByTestId('wrapper').firstChild!.textContent!)).toEqual({
                ...initialComponent.props,
                uid: initialComponent.uid,
            })
        );

        const newComponent = {
            name: 'TestPropsComponent',
            props: {
                children: 'new content',
            },
            uid: 'uid',
        };

        rerender(
            <div data-testid="wrapper">
                <DynamicComponent component={newComponent} />
            </div>
        );

        await waitFor(() =>
            expect(JSON.parse(getByTestId('wrapper').firstChild!.textContent!)).toEqual({
                ...newComponent.props,
                uid: newComponent.uid,
            })
        );
    });

    it('should inherit suspend_render setting', async () => {
        function Harness(): JSX.Element {
            const fallback = React.useContext(FallbackCtx);

            return <div data-testid="fallback">{fallback!.suspend}</div>;
        }

        const testSuspend = 999;

        const { getByTestId } = wrappedRender(
            <DynamicComponent
                component={{
                    name: 'TestComponent',
                    props: {
                        children: <Harness />,
                        fallback: {
                            name: 'Fallback',
                            props: {
                                suspend_render: testSuspend,
                            },
                            uid: 'fallback-uid',
                        },
                    },
                    uid: 'uid',
                }}
            />
        );

        await waitFor(() => expect(getByTestId('fallback')).toBeInTheDocument());

        expect(getByTestId('fallback')).toHaveTextContent(String(testSuspend));
    });

    it("should load the component from the registry and call the backend if it's a python one", async () => {
        const { getByText } = wrappedRender(
            <DynamicComponent
                component={{
                    name: 'TestComponent2',
                    props: {
                        // Check that dynamic kwargs get passed to the backend
                        dynamic_kwargs: {
                            test: {
                                __typename: 'Variable',
                                default: 'test',
                                uid: 'uid',
                            },
                        },
                    },
                    uid: 'uid',
                }}
            />
        );
        await waitFor(() => {
            // This also checks that the payload is passed to the mock backend correctly (the values object)
            expect(
                getByText(
                    'TestComponent2: {"uid":"uid","values":{"data":{"test":{"__ref":"Variable:uid"}},"lookup":{"Variable:uid":"test"}},"ws_channel":"uid"}'
                )
            ).toBeInstanceOf(HTMLDivElement);
        });
    });

    it('should publish EventBus notification on server component render', async () => {
        const receivedData: Array<DaraEventMap['SERVER_COMPONENT_LOADED']> = [];

        const { getByText } = wrappedRender(
            <EventCapturer
                onEvent={(event) => {
                    if (event.type === 'SERVER_COMPONENT_LOADED') {
                        receivedData.push(event.data);
                    }
                }}
            >
                <DynamicComponent
                    component={{
                        name: 'TestComponent2',
                        props: {
                            // Check that dynamic kwargs get passed to the backend
                            dynamic_kwargs: {
                                test: {
                                    __typename: 'Variable',
                                    default: 'test',
                                    uid: 'uid',
                                },
                            },
                        },
                        uid: 'uid',
                    }}
                />
            </EventCapturer>
        );
        await waitFor(() => {
            expect(getByText(/TestComponent2/)).toBeInstanceOf(HTMLDivElement);
        });

        const value = getByText(/TestComponent2/).textContent;

        // single event bus notification should come through
        expect(receivedData).toHaveLength(1);
        expect(receivedData[0]).toEqual({
            uid: 'uid',
            name: 'TestComponent2',
            value: {
                name: 'RawString',
                props: {
                    content: value,
                },
            },
        });
    });

    it('should render RawString py_component directly', async () => {
        server.use(
            http.post('/api/core/components/:component', () => {
                return HttpResponse.json({
                    data: {
                        name: 'RawString',
                        props: {
                            content: 'test_content',
                        },
                        uid: 'uid',
                    },
                    lookup: {},
                });
            })
        );

        const { getByTestId, queryByTestId } = wrappedRender(
            <div data-testid="content">
                <DynamicComponent
                    component={{
                        name: 'TestComponent2',
                        props: {
                            dynamic_kwargs: {},
                        },
                        uid: 'uid',
                    }}
                />
            </div>
        );
        await waitFor(() => expect(getByTestId('content').firstChild).not.toBe(null));
        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());
        await waitFor(() => expect(getByTestId('content').textContent).toBe('test_content'));
    });

    it('should render InvalidComponent py_component directly as an error', async () => {
        server.use(
            http.post('/api/core/components/:component', () => {
                return HttpResponse.json({
                    data: {
                        name: 'InvalidComponent',
                        props: {
                            error: 'test_error',
                        },
                        uid: 'uid',
                    },
                    lookup: {},
                });
            })
        );

        const { getByTestId } = wrappedRender(
            <div data-testid="content">
                <DynamicComponent
                    component={{
                        name: 'TestComponent2',
                        props: {
                            dynamic_kwargs: {},
                        },
                        uid: 'uid',
                    }}
                />
            </div>
        );
        await waitFor(() => expect(getByTestId('content').firstChild).not.toBe(null));
        // Check that 'test_error' is rendered somewhere in the error component
        await waitFor(() => expect(getByTestId('content').textContent).toContain('test_error'));
    });

    it("should load the component from the registry, call the backend if it's a python one and also render the fallback while the component is fetched", async () => {
        const { container, getByText } = wrappedRender(
            <DynamicComponent
                component={{
                    name: 'TestComponent2',
                    props: {
                        // Check that both dynamic and static kwargs get passed to the backend
                        dynamic_kwargs: {
                            test: {
                                __typename: 'Variable',
                                default: 'test',
                                uid: 'uid',
                            },
                        },
                        fallback: {
                            name: 'TestComponent',
                            props: {
                                suspend_render: true,
                            },
                            uid: 'uid3',
                        },
                    },
                    uid: 'uid',
                }}
            />
        );
        // Check that the new fallback gets loaded first and then gets removed
        await waitFor(() => {
            expect(queryByAttribute('uid', container, 'uid3')).toBeInTheDocument();
        });

        await waitFor(() => expect(queryByAttribute('uid', container, 'uid3')).not.toBeInTheDocument());
        // This also checks that the payload is passed to the mock backend correctly (the values object)
        expect(
            getByText(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"__ref":"Variable:uid"}},"lookup":{"Variable:uid":"test"}},"ws_channel":"uid"}'
            )
        ).toBeInstanceOf(HTMLDivElement);
    });

    it('should handle DerivedVariables correctly', async () => {
        const { getByTestId } = wrappedRender(
            <div data-testid="wrapper">
                <DynamicComponent
                    component={{
                        name: 'TestComponent2',
                        props: {
                            // Check that both dynamic and static kwargs get passed to the backend
                            dynamic_kwargs: {
                                test: {
                                    __typename: 'DerivedVariable',
                                    default: 'test_derived',
                                    deps: [
                                        { __typename: 'Variable', default: 1, uid: 'dep1' },
                                        { __typename: 'Variable', default: 2, uid: 'dep2' },
                                    ],
                                    uid: 'uid',
                                    variables: [
                                        { __typename: 'Variable', default: 1, uid: 'dep1' },
                                        { __typename: 'Variable', default: 2, uid: 'dep2' },
                                    ],
                                },
                            },
                        },
                        uid: 'uid',
                    }}
                />
            </div>
        );
        // This also checks that the payload is passed to the mock backend correctly (the values object)
        await waitFor(() => {
            const content = getByTestId('wrapper').innerHTML;
            expect(content.startsWith('TestComponent2:')).toBe(true);
            expect(JSON.parse(content.split('TestComponent2:')[1]!)).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            force_key: null,
                            type: 'derived',
                            uid: 'uid',
                            values: [{ __ref: 'Variable:dep1' }, { __ref: 'Variable:dep2' }],
                        },
                    },
                    lookup: { 'Variable:dep1': 1, 'Variable:dep2': 2 },
                },
                ws_channel: 'uid',
            });
        });
    });

    it('should handle deps correctly', async () => {
        const variableA: SingleVariable<number> = {
            __typename: 'Variable',
            default: 1,
            nested: [],
            uid: 'a',
        };
        const variableB: SingleVariable<number> = {
            __typename: 'Variable',
            default: 2,
            nested: [],
            uid: 'b',
        };

        const variableResult: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variableA],
            nested: [],
            uid: 'result',
            variables: [variableA, variableB],
        };

        const MockComponent = (props: { varA: Variable<any>; varB: Variable<any> }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.varA);
            const [b, setB] = useVariable<number>(props.varB);

            return (
                <>
                    <span data-testid="dynamic-wrapper">
                        <DynamicComponent
                            component={{
                                name: 'TestComponent2',
                                props: {
                                    dynamic_kwargs: {
                                        test: variableResult,
                                    },
                                },
                                uid: 'uid',
                            }}
                        />
                    </span>
                    <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                    <input data-testid="b" onChange={(e) => setB(Number(e.target.value))} value={b} />
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent varA={variableA} varB={variableB} />);

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"result","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"result","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating a should update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"result","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null}},"lookup":{"Variable:a":5,"Variable:b":5}},"ws_channel":"uid"}'
            );
        });
    });

    it('should recalculate when trigger is used', async () => {
        const variableA: SingleVariable<number> = {
            __typename: 'Variable',
            default: 1,
            nested: [],
            uid: 'a',
        };
        const variableB: SingleVariable<number> = {
            __typename: 'Variable',
            default: 2,
            nested: [],
            uid: 'b',
        };

        const variableEmpty: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [],
            nested: [],
            uid: 'empty',
            variables: [variableA, variableB],
        };

        const triggerAction: TriggerVariableImpl = {
            __typename: 'ActionImpl',
            force: false,
            name: 'TriggerVariable',
            variable: variableEmpty,
        };

        const MockComponent = (props: { action: Action; varA: Variable<any>; varB: Variable<any> }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.varA);
            const [b, setB] = useVariable<number>(props.varB);
            const callAction = useAction(props.action);

            return (
                <>
                    <span data-testid="dynamic-wrapper">
                        <DynamicComponent
                            component={{
                                name: 'TestComponent2',
                                props: {
                                    dynamic_kwargs: {
                                        test: variableEmpty,
                                    },
                                },
                                uid: 'uid',
                            }}
                        />
                    </span>
                    <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                    <input data-testid="b" onChange={(e) => setB(Number(e.target.value))} value={b} />
                    <button
                        data-testid="trigger"
                        onClick={(e) => {
                            callAction(e);
                        }}
                        type="button"
                    >
                        recalculate
                    </button>
                </>
            );
        };

        const { getByTestId, queryByTestId } = wrappedRender(
            <MockComponent action={triggerAction} varA={variableA} varB={variableB} />
        );

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));
        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());

        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
        );

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });
        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());
        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
        );

        // Updating a shouldn't update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });
        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());
        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
        );

        // Trigger should update the dynamic component output
        act(() => {
            fireEvent.click(getByTestId('trigger'));
        });
        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());
        await waitFor(() =>
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null}},"lookup":{"Variable:a":5,"Variable:b":5}},"ws_channel":"uid"}'
            )
        );
    });

    it('should update when nested derived variable is triggered', async () => {
        const variable: Variable<number> = {
            __typename: 'Variable',
            default: 5,
            nested: [],
            uid: 'base_variable',
        };

        const intermediateVariable: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [],
            nested: [],
            uid: 'intermediate_variable',
            variables: [variable],
        };

        const finalResult: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [intermediateVariable],
            nested: [],
            uid: 'final_variable',
            variables: [intermediateVariable],
        };

        const triggerAction: TriggerVariableImpl = {
            __typename: 'ActionImpl',
            force: true,
            name: 'TriggerVariable',
            variable: intermediateVariable,
        };

        // Custom mock component version
        const MockComponentTrigger = (props: { action: Action; variableA: Variable<any> }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.variableA);
            const callAction = useAction(props.action);

            return (
                <>
                    <span data-testid="dynamic-wrapper">
                        <DynamicComponent
                            component={{
                                name: 'TestComponent2',
                                props: {
                                    dynamic_kwargs: {
                                        test: finalResult,
                                    },
                                },
                                uid: 'uid',
                            }}
                        />
                    </span>
                    <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                    <button
                        data-testid="trigger"
                        onClick={(e) => {
                            callAction(e);
                        }}
                        type="button"
                    >
                        recalculate
                    </button>
                </>
            );
        };

        const { getByTestId, queryByTestId } = wrappedRender(
            <MockComponentTrigger action={triggerAction} variableA={variable} />
        );

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));
        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());

        const getContent = (): object =>
            JSON.parse(getByTestId('dynamic-wrapper').innerHTML.replace('TestComponent2: ', ''));

        expect(getContent()).toEqual({
            uid: 'uid',
            values: {
                data: {
                    test: {
                        type: 'derived',
                        uid: 'final_variable',
                        values: [
                            {
                                type: 'derived',
                                uid: 'intermediate_variable',
                                values: [{ __ref: 'Variable:base_variable' }],
                                force_key: null,
                            },
                        ],
                        force_key: null,
                    },
                },
                lookup: { 'Variable:base_variable': 5 },
            },
            ws_channel: 'uid',
        });

        // Updating a shouldn't update output
        const input = getByTestId('a');
        fireEvent.change(input, { target: { value: 10 } });

        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());

        expect(getContent()).toEqual({
            uid: 'uid',
            values: {
                data: {
                    test: {
                        type: 'derived',
                        uid: 'final_variable',
                        values: [
                            {
                                type: 'derived',
                                uid: 'intermediate_variable',
                                values: [{ __ref: 'Variable:base_variable' }],
                                force_key: null,
                            },
                        ],
                        force_key: null,
                    },
                },
                lookup: { 'Variable:base_variable': 5 },
            },
            ws_channel: 'uid',
        });

        // Trigger should update the dynamic component output
        fireEvent.click(getByTestId('trigger'));

        await waitFor(() => expect(queryByTestId('LOADING')).not.toBeInTheDocument());
        await waitFor(() =>
            expect(getContent()).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            type: 'derived',
                            uid: 'final_variable',
                            values: [
                                {
                                    type: 'derived',
                                    uid: 'intermediate_variable',
                                    values: [{ __ref: 'Variable:base_variable' }],
                                    // intermediate var is forced
                                    force_key: expect.any(String),
                                },
                            ],
                            // top-level var is not forced
                            force_key: null,
                        },
                    },
                    lookup: { 'Variable:base_variable': 10 },
                },
                ws_channel: 'uid',
            })
        );
    });

    it('should handle `nested` on a deps variable correctly', async () => {
        const variableNestedA: Variable<Record<string, number>> = {
            __typename: 'Variable',
            default: {
                a: 1,
                b: 2,
            },
            nested: ['a'],
            uid: 'nested-variable',
        };

        const variableNestedB = {
            ...variableNestedA,
            nested: ['b'],
        };

        const derivedVariable: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variableNestedA],
            nested: [],
            uid: 'derived-variable',
            variables: [variableNestedA, variableNestedB],
        };

        const MockComponent = (props: { varA: Variable<any>; varB: Variable<any> }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.varA);
            const [b, setB] = useVariable<number>(props.varB);

            return (
                <>
                    <span data-testid="dynamic-wrapper">
                        <DynamicComponent
                            component={{
                                name: 'TestComponent2',
                                props: {
                                    dynamic_kwargs: {
                                        test: derivedVariable,
                                    },
                                },
                                uid: 'uid',
                            }}
                        />
                    </span>
                    <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                    <input data-testid="b" onChange={(e) => setB(Number(e.target.value))} value={b} />
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent varA={variableNestedA} varB={variableNestedB} />);

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));

        // Note: nested variables are denormalized separately
        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"derived-variable","values":[{"__ref":"Variable:nested-variable:a"},{"__ref":"Variable:nested-variable:b"}],"force_key":null}},"lookup":{"Variable:nested-variable:a":1,"Variable:nested-variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating B shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });
        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"derived-variable","values":[{"__ref":"Variable:nested-variable:a"},{"__ref":"Variable:nested-variable:b"}],"force_key":null}},"lookup":{"Variable:nested-variable:a":1,"Variable:nested-variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating A shouldn't update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });
        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"derived-variable","values":[{"__ref":"Variable:nested-variable:a"},{"__ref":"Variable:nested-variable:b"}],"force_key":null}},"lookup":{"Variable:nested-variable:a":5,"Variable:nested-variable:b":5}},"ws_channel":"uid"}'
            );
        });
    });

    it('should handle nested deps correctly', async () => {
        const variableA: SingleVariable<number> = {
            __typename: 'Variable',
            default: 1,
            nested: [],
            uid: 'a',
        };

        const variableB: SingleVariable<number> = {
            __typename: 'Variable',
            default: 2,
            nested: [],
            uid: 'b',
        };

        const variableC: SingleVariable<number> = {
            __typename: 'Variable',
            default: 3,
            nested: [],
            uid: 'c',
        };

        const intermediateVariable: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variableA],
            nested: [],
            uid: 'intermediate',
            variables: [variableA, variableB], // ignore B
        };

        const finalResult: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [intermediateVariable],
            nested: [],
            uid: 'final',
            variables: [intermediateVariable, variableC], // ignore C
        };

        const MockComponent = (props: {
            varA: Variable<any>;
            varB: Variable<any>;
            varC: Variable<any>;
        }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.varA);
            const [b, setB] = useVariable<number>(props.varB);
            const [c, setC] = useVariable<number>(props.varC);

            return (
                <>
                    <span data-testid="dynamic-wrapper">
                        <DynamicComponent
                            component={{
                                name: 'TestComponent2',
                                props: {
                                    dynamic_kwargs: {
                                        test: finalResult,
                                    },
                                },
                                uid: 'uid',
                            }}
                        />
                    </span>
                    <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
                    <input data-testid="b" onChange={(e) => setB(Number(e.target.value))} value={b} />
                    <input data-testid="c" onChange={(e) => setC(Number(e.target.value))} value={c} />
                </>
            );
        };

        const { getByTestId } = wrappedRender(<MockComponent varA={variableA} varB={variableB} varC={variableC} />);

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null},{"__ref":"Variable:c"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2,"Variable:c":3}},"ws_channel":"uid"}'
            );
        });

        // Updating c shouldn't update output
        act(() => {
            const input = getByTestId('c');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null},{"__ref":"Variable:c"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2,"Variable:c":3}},"ws_channel":"uid"}'
            );
        });

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null},{"__ref":"Variable:c"}],"force_key":null}},"lookup":{"Variable:a":1,"Variable:b":2,"Variable:c":3}},"ws_channel":"uid"}'
            );
        });

        // Updating a should update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force_key":null},{"__ref":"Variable:c"}],"force_key":null}},"lookup":{"Variable:a":5,"Variable:b":5,"Variable:c":5}},"ws_channel":"uid"}'
            );
        });
    });
});
