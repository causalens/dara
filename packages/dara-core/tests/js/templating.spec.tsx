import { nanoid } from 'nanoid';

import type { ComponentInstance, DerivedVariable, LoopVariable } from '@/types/core';

import { type Marker, applyMarkers, getInjectionMarkers, hasMarkers } from '../../js/components/for/templating';

// Mock the nanoid function to return predictable values for testing
jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'mock-nanoid-123'),
}));

describe('templating utilities', () => {
    const mockLoopVariable: LoopVariable = {
        __typename: 'LoopVariable',
        uid: 'loop-uid-123',
        nested: ['name'],
    };

    const mockDerivedVariable: DerivedVariable = {
        __typename: 'DerivedVariable',
        cache: null,
        deps: [],
        nested: [],
        uid: 'derived-uid-456',
        variables: [],
    };

    const mockDerivedVariableTwo: DerivedVariable = {
        __typename: 'DerivedVariable',
        cache: null,
        deps: [],
        nested: [],
        uid: 'derived-uid-456',
        variables: [],
    };

    const mockLoopVariableWithDeepNesting: LoopVariable = {
        __typename: 'LoopVariable',
        uid: 'loop-uid-456',
        nested: ['user', 'profile', 'email'],
    };

    describe('getInjectionMarkers', () => {
        it('should return empty array for renderer with no loop variables', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    title: 'Hello World',
                    count: 42,
                    isVisible: true,
                },
                uid: 'component-uid',
            };

            const markers = getInjectionMarkers(renderer);
            expect(markers).toEqual([]);
        });

        it('should find loop variable at top level', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    user: mockLoopVariable,
                    title: 'Hello',
                },
                uid: 'component-uid',
            };

            const markers = getInjectionMarkers(renderer);
            expect(markers).toEqual([
                {
                    type: 'loop_var',
                    path: 'props.user',
                    nested: ['name'],
                },
            ]);
        });

        it('should find loop variables in nested objects', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    data: {
                        user: mockLoopVariable,
                        metadata: {
                            item: mockLoopVariableWithDeepNesting,
                        },
                    },
                    title: 'Hello',
                },
                uid: 'component-uid',
            };

            const markers = getInjectionMarkers(renderer);
            expect(markers).toEqual([
                {
                    type: 'loop_var',
                    path: 'props.data.user',
                    nested: ['name'],
                },
                {
                    type: 'loop_var',
                    path: 'props.data.metadata.item',
                    nested: ['user', 'profile', 'email'],
                },
            ]);
        });

        it('should find loop variables in arrays', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    items: [
                        { label: 'First', value: mockLoopVariable },
                        { label: 'Second', data: { nested: mockLoopVariableWithDeepNesting } },
                    ],
                },
                uid: 'component-uid',
            };

            const markers = getInjectionMarkers(renderer);
            expect(markers).toEqual([
                {
                    type: 'loop_var',
                    path: 'props.items.0.value',
                    nested: ['name'],
                },
                {
                    type: 'loop_var',
                    path: 'props.items.1.data.nested',
                    nested: ['user', 'profile', 'email'],
                },
            ]);
        });

        it('should find derived variables and create markers with loop instance uid', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    computed: { ...mockDerivedVariable, variables: [mockLoopVariable] },
                },
                uid: 'component-uid',
            };

            const markers = getInjectionMarkers(renderer);
            expect(markers).toEqual([
                {
                    type: 'loop_var',
                    path: 'props.computed.variables.0',
                    nested: ['name'],
                },
                {
                    type: 'derived_var',
                    path: 'props.computed',
                    loopInstanceUid: 'loop-uid-123',
                },
            ]);
        });

        it('should handle nested derived variables', () => {
            const renderer = {
                name: 'ComplexComponent',
                props: {
                    body: {
                        sections: [
                            {
                                content: {
                                    ...mockDerivedVariable,
                                    variables: [
                                        { ...mockDerivedVariableTwo, variables: [mockLoopVariable] },
                                        mockLoopVariableWithDeepNesting,
                                    ],
                                },
                            },
                        ],
                    },
                },
                uid: 'complex-component-uid',
            };

            const markers = getInjectionMarkers(renderer);
            expect(markers).toEqual([
                {
                    path: 'props.body.sections.0.content.variables.0.variables.0',
                    nested: ['name'],
                    type: 'loop_var',
                },
                {
                    type: 'derived_var',
                    path: 'props.body.sections.0.content',
                    loopInstanceUid: 'loop-uid-123',
                },
                {
                    path: 'props.body.sections.0.content.variables.1',
                    nested: ['user', 'profile', 'email'],
                    type: 'loop_var',
                },
                {
                    type: 'derived_var',
                    path: 'props.body.sections.0.content',
                    loopInstanceUid: 'loop-uid-456',
                },
            ]);
        });
    });

    describe('applyMarkers', () => {
        beforeEach(() => {
            (nanoid as jest.Mock).mockReturnValue('mock-nanoid-123');
        });

        it('should return original renderer when no markers provided', () => {
            const renderer = {
                name: 'TestComponent',
                props: { title: 'Hello' },
                uid: 'component-uid',
            };

            const result = applyMarkers(renderer, [], { name: 'John' }, 'item-1');
            expect(result).toEqual(renderer);
            expect(result).toBe(renderer); // should NOT be a deep clone for perf
        });

        it('should apply loop variable markers correctly', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    user: mockLoopVariable,
                    title: 'Hello',
                },
                uid: 'component-uid',
            };

            const markers: Marker[] = [
                {
                    type: 'loop_var',
                    path: 'props.user',
                    nested: ['name'],
                },
            ];

            const loopValue = { name: 'John Doe', age: 30 };
            const result = applyMarkers(renderer, markers, loopValue, 'item-1');

            expect(result.props.user).toBe('John Doe');
            expect(result.props.title).toBe('Hello');
        });

        it('should apply nested loop variable markers', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    data: {
                        user: mockLoopVariableWithDeepNesting,
                    },
                },
                uid: 'component-uid',
            };

            const markers: Marker[] = [
                {
                    type: 'loop_var',
                    path: 'props.data.user',
                    nested: ['user', 'profile', 'email'],
                },
            ];

            const loopValue = {
                user: {
                    profile: {
                        email: 'john@example.com',
                        name: 'John',
                    },
                },
            };

            const result = applyMarkers(renderer, markers, loopValue, 'item-1');
            expect(result.props.data.user).toBe('john@example.com');
        });

        it('should apply derived variable markers with loop instance uid', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    computed: mockDerivedVariable,
                },
                uid: 'component-uid',
            };

            const markers: Marker[] = [
                {
                    type: 'derived_var',
                    path: 'props.computed',
                    loopInstanceUid: 'loop-uid-123',
                },
            ];

            const result = applyMarkers(renderer, markers, { name: 'John' }, 'item-5');

            expect(result.props.computed.loop_instance_uid).toBe('loop-uid-123:item-5');
            expect(result.props.computed.uid).toBe('derived-uid-456'); // original uid preserved
        });

        it('should apply server component markers with loop instance uid', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    serverComp: {
                        name: 'py-component-uid',
                        uid: 'instance-uid',
                        props: {
                            func_name: 'my_func',
                            dynamic_kwargs: {
                                arg1: mockLoopVariable,
                            },
                        },
                    } as ComponentInstance,
                },
                uid: 'component-uid',
            } as const;

            const markers: Marker[] = [
                {
                    type: 'server_component',
                    path: 'props.serverComp',
                    loopInstanceUid: 'loop-uid-789',
                },
            ];

            const result = applyMarkers(renderer, markers, { name: 'John' }, 'item-10');

            expect(result.props.serverComp.loop_instance_uid).toBe('loop-uid-789:item-10');
        });

        it('should generate new UIDs for action loading states', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    action: {
                        __typename: 'AnnotatedAction',
                        loading: { uid: 'original-loading-uid' },
                    },
                },
                uid: 'component-uid',
            };

            const markers: Marker[] = [
                {
                    type: 'action',
                    path: 'props.action',
                },
            ];

            const result = applyMarkers(renderer, markers, { name: 'John' }, 'item-1');

            expect(result.props.action.loading.uid).toBe('mock-nanoid-123');
            expect(nanoid).toHaveBeenCalled();
        });

        it('should apply multiple markers of different types', () => {
            const renderer = {
                name: 'TestComponent',
                props: {
                    user: mockLoopVariable,
                    computed: mockDerivedVariable,
                    nested: {
                        data: mockLoopVariableWithDeepNesting,
                    },
                },
                uid: 'component-uid',
            };

            const markers: Marker[] = [
                { type: 'loop_var', path: 'props.user', nested: ['name'] },
                { type: 'derived_var', path: 'props.computed', loopInstanceUid: 'loop-uid-123' },
                { type: 'loop_var', path: 'props.nested.data', nested: ['user', 'profile', 'email'] },
            ];

            const loopValue = {
                name: 'Jane Doe',
                user: { profile: { email: 'jane@example.com' } },
            };

            const result = applyMarkers(renderer, markers, loopValue, 'item-2');

            expect(result.props.user).toBe('Jane Doe');
            expect(result.props.computed.loop_instance_uid).toBe('loop-uid-123:item-2');
            expect(result.props.nested.data).toBe('jane@example.com');
        });
    });

    describe('hasMarkers', () => {
        it('should return null when component has no loop variables in top-level props', () => {
            const component: ComponentInstance = {
                name: 'TestComponent',
                props: {
                    title: 'Hello',
                    count: 42,
                    isVisible: true,
                    nested: {
                        user: mockLoopVariable, // nested doesn't count
                    },
                },
                uid: 'component-uid',
            };

            const result = hasMarkers(component);
            expect(result).toBeNull();
        });

        it('should return the prop key when component has loop variable in top-level props', () => {
            const component: ComponentInstance = {
                name: 'TestComponent',
                props: {
                    user: mockLoopVariable,
                    title: 'Hello',
                },
                uid: 'component-uid',
            };

            const result = hasMarkers(component);
            expect(result).toBe('user');
        });

        it('should return the first loop variable prop key when multiple exist', () => {
            const component: ComponentInstance = {
                name: 'TestComponent',
                props: {
                    title: 'Hello',
                    user: mockLoopVariable,
                    item: mockLoopVariableWithDeepNesting,
                },
                uid: 'component-uid',
            };

            const result = hasMarkers(component);
            // Should return the first one found (order depends on Object.entries)
            expect(['user', 'item'].includes(result!)).toBe(true);
        });

        it('should handle component with empty props', () => {
            const component: ComponentInstance = {
                name: 'TestComponent',
                props: {},
                uid: 'component-uid',
            };

            const result = hasMarkers(component);
            expect(result).toBeNull();
        });
    });
});
