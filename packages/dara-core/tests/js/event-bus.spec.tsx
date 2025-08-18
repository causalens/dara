import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EventBus, useEventBus } from '@/shared';
import { DEFAULT_BUS, EventCapturer } from '@/shared/event-bus/event-bus';
import type { DaraEventMap } from '@/types/core';

describe('Event Bus', () => {
    it('should invoke provided callback when subscribed', () => {
        const bus = new EventBus();

        const callback = vi.fn();

        const unsub = bus.subscribe(callback);

        bus.publish('test_type', { test: 'data' });

        expect(callback).toHaveBeenCalledWith({ type: 'test_type', data: { test: 'data' } });

        unsub();

        bus.publish('test_type', { test: 'data_new' });

        // no new invocation
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should bubble up events to parent bus', () => {
        const parentBus = new EventBus();
        const childBus = new EventBus(parentBus);

        const callback = vi.fn();
        const childCallback = vi.fn();

        parentBus.subscribe(callback);
        childBus.subscribe(childCallback);

        childBus.publish('test_type', { test: 'data' });

        expect(callback).toHaveBeenCalledWith({ type: 'test_type', data: { test: 'data' } });
        expect(childCallback).toHaveBeenCalledWith({ type: 'test_type', data: { test: 'data' } });
    });
});

function TestComponent(props: { eventType: keyof DaraEventMap; eventData: any }): JSX.Element {
    const bus = useEventBus();

    return (
        <button
            type="button"
            onClick={() => {
                bus.publish(props.eventType, props.eventData);
            }}
            data-testid="button"
        >
            click
        </button>
    );
}

describe('EventCapturer', () => {
    it('should call onEvent with the event data', async () => {
        const user = userEvent.setup();
        const callback = vi.fn();

        const daraEvent = {
            type: 'DERIVED_VARIABLE_LOADED',
            data: {
                variable: { uid: 'test' },
                value: 'test_value',
            },
        };

        render(
            <EventCapturer onEvent={callback}>
                <TestComponent eventType="DERIVED_VARIABLE_LOADED" eventData={daraEvent.data} />
            </EventCapturer>
        );

        await user.click(screen.getByTestId('button'));

        await waitFor(() => {
            expect(callback).toHaveBeenCalledWith(daraEvent);
        });
    });

    it('should bubble up events', async () => {
        const user = userEvent.setup();

        const callback = vi.fn();
        const parentCallback = vi.fn();
        const rootCallback = vi.fn();

        const daraEvent = {
            type: 'DERIVED_VARIABLE_LOADED',
            data: {
                variable: { uid: 'test' },
                value: 'test_value',
            },
        };

        DEFAULT_BUS.subscribe(rootCallback);

        render(
            <EventCapturer onEvent={parentCallback}>
                <EventCapturer onEvent={callback}>
                    <TestComponent eventType="DERIVED_VARIABLE_LOADED" eventData={daraEvent.data} />
                </EventCapturer>
            </EventCapturer>
        );

        await user.click(screen.getByTestId('button'));

        await waitFor(() => {
            expect(callback).toHaveBeenCalledWith(daraEvent);
        });
        expect(parentCallback).toHaveBeenCalledWith(daraEvent);
        expect(rootCallback).toHaveBeenCalledWith(daraEvent);
    });
});
