import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { EventBus, useEventBus } from '@/shared';
import { DEFAULT_BUS, EventCapturer } from '@/shared/event-bus/event-bus';
import { DaraEventMap } from '@/types/event-types';

describe('Event Bus', () => {
    it('should invoke provided callback when subscribed', () => {
        const bus = new EventBus();

        const callback = jest.fn();

        const unsub = bus.subscribe(callback);

        bus.publish('test_type', { test: 'data' });

        expect(callback).toHaveBeenCalledWith({ data: { test: 'data' }, type: 'test_type' });

        unsub();

        bus.publish('test_type', { test: 'data_new' });

        // no new invocation
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should bubble up events to parent bus', () => {
        const parentBus = new EventBus();
        const childBus = new EventBus(parentBus);

        const callback = jest.fn();
        const childCallback = jest.fn();

        parentBus.subscribe(callback);
        childBus.subscribe(childCallback);

        childBus.publish('test_type', { test: 'data' });

        expect(callback).toHaveBeenCalledWith({ data: { test: 'data' }, type: 'test_type' });
        expect(childCallback).toHaveBeenCalledWith({ data: { test: 'data' }, type: 'test_type' });
    });
});

function TestComponent(props: { eventData: any; eventType: keyof DaraEventMap }): JSX.Element {
    const bus = useEventBus();

    return (
        <button
            data-testid="button"
            onClick={() => {
                bus.publish(props.eventType, props.eventData);
            }}
            type="button"
        >
            click
        </button>
    );
}

describe('EventCapturer', () => {
    it('should call onEvent with the event data', async () => {
        const user = userEvent.setup();
        const callback = jest.fn();

        const daraEvent = {
            data: {
                value: 'test_value',
                variable: { uid: 'test' },
            },
            type: 'DERIVED_VARIABLE_LOADED',
        };

        render(
            <EventCapturer onEvent={callback}>
                <TestComponent eventData={daraEvent.data} eventType="DERIVED_VARIABLE_LOADED" />
            </EventCapturer>
        );

        await user.click(screen.getByTestId('button'));

        await waitFor(() => {
            expect(callback).toHaveBeenCalledWith(daraEvent);
        });
    });

    it('should bubble up events', async () => {
        const user = userEvent.setup();

        const callback = jest.fn();
        const parentCallback = jest.fn();
        const rootCallback = jest.fn();

        const daraEvent = {
            data: {
                value: 'test_value',
                variable: { uid: 'test' },
            },
            type: 'DERIVED_VARIABLE_LOADED',
        };

        DEFAULT_BUS.subscribe(rootCallback);

        render(
            <EventCapturer onEvent={parentCallback}>
                <EventCapturer onEvent={callback}>
                    <TestComponent eventData={daraEvent.data} eventType="DERIVED_VARIABLE_LOADED" />
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
