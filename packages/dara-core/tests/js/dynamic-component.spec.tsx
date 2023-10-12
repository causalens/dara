import { fireEvent, queryByAttribute, waitFor, waitForElementToBeRemoved } from '@testing-library/dom';
import { act } from '@testing-library/react';
import { rest } from 'msw';
import * as React from 'react';

import { clearRegistries_TEST } from '@/shared/interactivity/store';

import { DynamicComponent, useAction, useVariable } from '../../js/shared';
import { Action, DerivedVariable, SingleVariable, Variable } from '../../js/types';
import { DerivedDataVariable, TriggerVariableInstance } from '../../js/types/core';
import { server, wrappedRender } from './utils';

describe('DynamicComponent', () => {
    beforeEach(() => {
        server.listen({
            onUnhandledRequest: 'error',
        });

        // This is necessary to avoid data bleeding between tests
        // Though this causes warnings about duplicate atoms in the test console
        clearRegistries_TEST();
    });
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    it('should render nothing until the component has loaded', async () => {
        const { container } = wrappedRender(
            <DynamicComponent component={{ name: 'TestComponent', props: {}, uid: 'uid' }} />
        );
        await waitFor(() => {
            expect(container.firstChild).toBe(null);
        });
    });

    it("should load the component from the registry and render it if it's a JS one", async () => {
        const { container } = wrappedRender(
            <DynamicComponent component={{ name: 'TestComponent', props: {}, uid: 'uid' }} />
        );
        await waitFor(() => expect(container.firstChild).not.toBe(null));
        expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
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

    it('should render RawString py_component directly', async () => {
        server.use(
            rest.post('/api/core/components/:component', async (req, res, ctx) => {
                return res(
                    ctx.json({
                        name: 'RawString',
                        props: {
                            content: 'test_content',
                        },
                        uid: 'uid',
                    })
                );
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
        await waitForElementToBeRemoved(() => getByTestId('LOADING'));
        await waitFor(() => expect(getByTestId('content').textContent).toBe('test_content'));
    });

    it('should render InvalidComponent py_component directly as an error', async () => {
        server.use(
            rest.post('/api/core/components/:component', async (req, res, ctx) => {
                return res(
                    ctx.json({
                        name: 'InvalidComponent',
                        props: {
                            error: 'test_error',
                        },
                        uid: 'uid',
                    })
                );
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
        await waitForElementToBeRemoved(() => getByTestId('LOADING'));
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
                            props: {},
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

        await waitForElementToBeRemoved(() => queryByAttribute('uid', container, 'uid3'));
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
            expect(JSON.parse(content.split('TestComponent2:')[1])).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            force: false,
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

    it('should handle DerivedDataVariables correctly', async () => {
        const { getByTestId } = wrappedRender(
            <div data-testid="wrapper">
                <DynamicComponent
                    component={{
                        name: 'TestComponent2',
                        props: {
                            dynamic_kwargs: {
                                test: {
                                    __typename: 'DerivedDataVariable',
                                    default: 'test_derived_data',
                                    deps: [
                                        { __typename: 'Variable', default: 1, uid: 'dep1' },
                                        { __typename: 'Variable', default: 2, uid: 'dep2' },
                                    ],
                                    filters: {
                                        column: 'col1',
                                        value: 'val1',
                                    },
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
            expect(JSON.parse(content.split('TestComponent2:')[1])).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            filters: {
                                column: 'col1',
                                value: 'val1',
                            },
                            force: false,
                            type: 'derived-data',
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
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"result","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"result","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating a should update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"result","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false}},"lookup":{"Variable:a":5,"Variable:b":5}},"ws_channel":"uid"}'
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

        const triggerAction: TriggerVariableInstance = {
            force: false,
            name: 'TriggerVariable',
            uid: 'triggerAction',
            variable: variableEmpty,
        };

        const MockComponent = (props: { action: Action; varA: Variable<any>; varB: Variable<any> }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.varA);
            const [b, setB] = useVariable<number>(props.varB);
            const [callAction] = useAction(props.action);

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

        const { getByTestId } = wrappedRender(
            <MockComponent action={triggerAction} varA={variableA} varB={variableB} />
        );

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));
        await waitForElementToBeRemoved(() => getByTestId('LOADING'));

        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
        );

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });
        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
        );

        // Updating a shouldn't update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });
        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2}},"ws_channel":"uid"}'
        );

        // Trigger should update the dynamic component output
        act(() => {
            fireEvent.click(getByTestId('trigger'));
        });
        await waitFor(() =>
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"empty","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false}},"lookup":{"Variable:a":5,"Variable:b":5}},"ws_channel":"uid"}'
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

        const triggerAction: TriggerVariableInstance = {
            force: true,
            name: 'TriggerVariable',
            uid: 'triggerAction',
            variable: intermediateVariable,
        };

        // Custom mock component version
        const MockComponentTrigger = (props: { action: Action; variableA: Variable<any> }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.variableA);
            const [callAction] = useAction(props.action);

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

        const { getByTestId } = wrappedRender(<MockComponentTrigger action={triggerAction} variableA={variable} />);

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));
        await waitForElementToBeRemoved(() => getByTestId('LOADING'));

        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final_variable","values":[{"type":"derived","uid":"intermediate_variable","values":[{"__ref":"Variable:base_variable"}],"force":false}],"force":false}},"lookup":{"Variable:base_variable":5}},"ws_channel":"uid"}'
        );

        // Updating a shouldn't update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 10 } });
        });
        expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
            'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final_variable","values":[{"type":"derived","uid":"intermediate_variable","values":[{"__ref":"Variable:base_variable"}],"force":false}],"force":false}},"lookup":{"Variable:base_variable":5}},"ws_channel":"uid"}'
        );

        // Trigger should update the dynamic component output
        act(() => {
            fireEvent.click(getByTestId('trigger'));
        });
        await waitFor(() =>
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final_variable","values":[{"type":"derived","uid":"intermediate_variable","values":[{"__ref":"Variable:base_variable"}],"force":true}],"force":true}},"lookup":{"Variable:base_variable":10}},"ws_channel":"uid"}'
            )
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
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"derived-variable","values":[{"__ref":"Variable:nested-variable:a"},{"__ref":"Variable:nested-variable:b"}],"force":false}},"lookup":{"Variable:nested-variable:a":1,"Variable:nested-variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating B shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });
        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"derived-variable","values":[{"__ref":"Variable:nested-variable:a"},{"__ref":"Variable:nested-variable:b"}],"force":false}},"lookup":{"Variable:nested-variable:a":1,"Variable:nested-variable:b":2}},"ws_channel":"uid"}'
            );
        });

        // Updating A shouldn't update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });
        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"derived-variable","values":[{"__ref":"Variable:nested-variable:a"},{"__ref":"Variable:nested-variable:b"}],"force":false}},"lookup":{"Variable:nested-variable:a":5,"Variable:nested-variable:b":5}},"ws_channel":"uid"}'
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
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false},{"__ref":"Variable:c"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2,"Variable:c":3}},"ws_channel":"uid"}'
            );
        });

        // Updating c shouldn't update output
        act(() => {
            const input = getByTestId('c');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false},{"__ref":"Variable:c"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2,"Variable:c":3}},"ws_channel":"uid"}'
            );
        });

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false},{"__ref":"Variable:c"}],"force":false}},"lookup":{"Variable:a":1,"Variable:b":2,"Variable:c":3}},"ws_channel":"uid"}'
            );
        });

        // Updating a should update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getByTestId('dynamic-wrapper').innerHTML).toBe(
                'TestComponent2: {"uid":"uid","values":{"data":{"test":{"type":"derived","uid":"final","values":[{"type":"derived","uid":"intermediate","values":[{"__ref":"Variable:a"},{"__ref":"Variable:b"}],"force":false},{"__ref":"Variable:c"}],"force":false}},"lookup":{"Variable:a":5,"Variable:b":5,"Variable:c":5}},"ws_channel":"uid"}'
            );
        });
    });

    it('DerivedDataVariable should handle nested deps correctly', async () => {
        // to not duplicate each DV test we're testing some complex scenarios just to make sure same logic is followed
        // as internally they share most of the logic
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

        const intermediateVariable: DerivedDataVariable = {
            __typename: 'DerivedDataVariable',
            // ignore B
            cache: 'global',

            deps: [variableA],

            filters: {
                column: 'col2',
                operator: 'EQ',
                value: 'val2',
            },

            uid: 'intermediate',
            variables: [variableA, variableB],
        };

        const finalResult: DerivedDataVariable = {
            __typename: 'DerivedDataVariable',
            // ignore C
            cache: 'global',

            deps: [intermediateVariable],

            filters: {
                column: 'col1',
                operator: 'EQ',
                value: 'val1',
            },

            uid: 'final',
            variables: [intermediateVariable, variableC],
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

        const getContent = (): object =>
            JSON.parse(getByTestId('dynamic-wrapper').innerHTML.split('TestComponent2: ')[1]);

        await waitFor(() => {
            expect(getContent()).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            filters: { column: 'col1', operator: 'EQ', value: 'val1' },
                            force: false,
                            type: 'derived-data',
                            uid: 'final',
                            values: [
                                {
                                    filters: { column: 'col2', operator: 'EQ', value: 'val2' },
                                    force: false,
                                    type: 'derived-data',
                                    uid: 'intermediate',
                                    values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                                },
                                { __ref: 'Variable:c' },
                            ],
                        },
                    },
                    lookup: { 'Variable:a': 1, 'Variable:b': 2, 'Variable:c': 3 },
                },
                ws_channel: 'uid',
            });
        });

        // Updating c shouldn't update output
        act(() => {
            const input = getByTestId('c');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getContent()).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            filters: { column: 'col1', operator: 'EQ', value: 'val1' },
                            force: false,
                            type: 'derived-data',
                            uid: 'final',
                            values: [
                                {
                                    filters: { column: 'col2', operator: 'EQ', value: 'val2' },
                                    force: false,
                                    type: 'derived-data',
                                    uid: 'intermediate',
                                    values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                                },
                                { __ref: 'Variable:c' },
                            ],
                        },
                    },
                    lookup: { 'Variable:a': 1, 'Variable:b': 2, 'Variable:c': 3 },
                },
                ws_channel: 'uid',
            });
        });

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getContent()).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            filters: { column: 'col1', operator: 'EQ', value: 'val1' },
                            force: false,
                            type: 'derived-data',
                            uid: 'final',
                            values: [
                                {
                                    filters: { column: 'col2', operator: 'EQ', value: 'val2' },
                                    force: false,
                                    type: 'derived-data',
                                    uid: 'intermediate',
                                    values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                                },
                                { __ref: 'Variable:c' },
                            ],
                        },
                    },
                    lookup: { 'Variable:a': 1, 'Variable:b': 2, 'Variable:c': 3 },
                },
                ws_channel: 'uid',
            });
        });

        // Updating a should update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });

        await waitFor(() => {
            expect(getContent()).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            filters: { column: 'col1', operator: 'EQ', value: 'val1' },
                            force: false,
                            type: 'derived-data',
                            uid: 'final',
                            values: [
                                {
                                    filters: { column: 'col2', operator: 'EQ', value: 'val2' },
                                    force: false,
                                    type: 'derived-data',
                                    uid: 'intermediate',
                                    values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                                },
                                { __ref: 'Variable:c' },
                            ],
                        },
                    },
                    lookup: { 'Variable:a': 5, 'Variable:b': 5, 'Variable:c': 5 },
                },
                ws_channel: 'uid',
            });
        });
    });

    it('should recalculate when DerivedDataVariable is triggered', async () => {
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

        const variableEmpty: DerivedDataVariable = {
            __typename: 'DerivedDataVariable',
            cache: 'global',
            deps: [],
            filters: { column: 'col1', operator: 'EQ', value: 'val1' },
            uid: 'empty',
            variables: [variableA, variableB],
        };

        const triggerAction: TriggerVariableInstance = {
            force: false,
            name: 'TriggerVariable',
            uid: 'triggerAction',
            variable: variableEmpty,
        };

        const MockComponent = (props: { action: Action; varA: Variable<any>; varB: Variable<any> }): JSX.Element => {
            const [a, setA] = useVariable<number>(props.varA);
            const [b, setB] = useVariable<number>(props.varB);
            const [callAction] = useAction(props.action);

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

        const { getByTestId } = wrappedRender(
            <MockComponent action={triggerAction} varA={variableA} varB={variableB} />
        );

        await waitFor(() => expect(getByTestId('dynamic-wrapper').innerHTML).not.toBe(''));
        await waitForElementToBeRemoved(() => getByTestId('LOADING'));

        const getContent = (): object =>
            JSON.parse(getByTestId('dynamic-wrapper').innerHTML.split('TestComponent2: ')[1]);

        expect(getContent()).toEqual({
            uid: 'uid',
            values: {
                data: {
                    test: {
                        filters: {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        force: false,
                        type: 'derived-data',
                        uid: 'empty',
                        values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    },
                },
                lookup: { 'Variable:a': 1, 'Variable:b': 2 },
            },
            ws_channel: 'uid',
        });

        // Updating b shouldn't update output
        act(() => {
            const input = getByTestId('b');
            fireEvent.change(input, { target: { value: 5 } });
        });
        expect(getContent()).toEqual({
            uid: 'uid',
            values: {
                data: {
                    test: {
                        filters: {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        force: false,
                        type: 'derived-data',
                        uid: 'empty',
                        values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    },
                },
                lookup: { 'Variable:a': 1, 'Variable:b': 2 },
            },
            ws_channel: 'uid',
        });

        // Updating a shouldn't update output
        act(() => {
            const input = getByTestId('a');
            fireEvent.change(input, { target: { value: 5 } });
        });
        expect(getContent()).toEqual({
            uid: 'uid',
            values: {
                data: {
                    test: {
                        filters: {
                            column: 'col1',
                            operator: 'EQ',
                            value: 'val1',
                        },
                        force: false,
                        type: 'derived-data',
                        uid: 'empty',
                        values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                    },
                },
                lookup: { 'Variable:a': 1, 'Variable:b': 2 },
            },
            ws_channel: 'uid',
        });

        // Trigger should update the dynamic component output
        act(() => {
            fireEvent.click(getByTestId('trigger'));
        });
        await waitFor(() =>
            expect(getContent()).toEqual({
                uid: 'uid',
                values: {
                    data: {
                        test: {
                            filters: {
                                column: 'col1',
                                operator: 'EQ',
                                value: 'val1',
                            },
                            force: false,
                            type: 'derived-data',
                            uid: 'empty',
                            values: [{ __ref: 'Variable:a' }, { __ref: 'Variable:b' }],
                        },
                    },
                    lookup: { 'Variable:a': 5, 'Variable:b': 5 },
                },
                ws_channel: 'uid',
            })
        );
    });
});
