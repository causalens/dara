import { act, renderHook } from '@testing-library/react';

import { DynamicComponent, useAction } from '@/shared';
import { clearCaches_TEST, registerComponents } from '@/shared/dynamic-component/dynamic-component';
import { clearRegistries_TEST } from '@/shared/interactivity/store';
import { clearActionHandlerCache_TEST, registerActions } from '@/shared/interactivity/use-action';
import type { ActionImpl } from '@/types';

import { Wrapper, server, wrappedRender } from './utils';

describe('custom implementation registries', () => {
    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
    beforeEach(() => {
        clearActionHandlerCache_TEST();
        clearCaches_TEST();
        clearRegistries_TEST();
    });
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    it.each(['__proto__', 'constructor', 'toString'])('registers and replaces the action named %s', async (name) => {
        const handler = vi.fn();
        const replacement = vi.fn();
        const onUnhandledAction = vi.fn();
        const action: ActionImpl = { __typename: 'ActionImpl', name };
        const nextAction: ActionImpl = { __typename: 'ActionImpl', name: 'NextAction' };
        registerActions({ [name]: handler });
        const { result } = renderHook(
            () => ({
                original: useAction(action, { onUnhandledAction }),
                next: useAction(nextAction),
            }),
            { wrapper: Wrapper }
        );

        await act(() => result.current.original('first'));
        expect(handler).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ input: 'first' }), action);
        expect(onUnhandledAction).not.toHaveBeenCalled();

        registerActions({ NextAction: replacement });
        await act(() => result.current.original('removed'));
        await act(() => result.current.next('next'));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(onUnhandledAction).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ input: 'removed' }),
            action
        );
        expect(replacement).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ input: 'next' }), nextAction);
    });

    it.each(['__proto__', 'constructor', 'toString'])(
        'does not resolve an unregistered inherited name %s',
        async (name) => {
            const onUnhandledAction = vi.fn();
            const action: ActionImpl = { __typename: 'ActionImpl', name };
            const { result } = renderHook(() => useAction(action, { onUnhandledAction }), { wrapper: Wrapper });

            await act(() => result.current('input'));
            expect(onUnhandledAction).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ input: 'input' }),
                action
            );
        }
    );

    it.each(['__proto__', 'constructor', 'toString'])('registers and replaces the component named %s', (name) => {
        function CustomComponent(): JSX.Element {
            return <p>Custom implementation</p>;
        }
        registerComponents({ [name]: CustomComponent });
        const { getByText, queryByText, rerender } = wrappedRender(
            <DynamicComponent component={{ name, props: {}, uid: 'original' }} />
        );
        expect(getByText('Custom implementation')).toBeInTheDocument();

        registerComponents({});
        rerender(<DynamicComponent component={{ name, props: {}, uid: 'replacement' }} />);
        expect(queryByText('Custom implementation')).not.toBeInTheDocument();
        expect(getByText(`Component ${name} could not be resolved`)).toBeInTheDocument();
    });
});
