import * as React from 'react';
import { Subject } from 'rxjs';

import { type DaraEvent, type DaraEventMap, type EventMap, type IEventBus, type UnionFromMap } from '@/types/core';

/**
 * Global event bus that allows to publish and subscribe to events.
 */
export class EventBus<MapT extends EventMap> implements IEventBus<MapT> {
    #events$: Subject<{ type: keyof MapT; data: MapT[keyof MapT] }> = new Subject();

    #parentBus: EventBus<MapT> | null = null;

    constructor(parentBus?: EventBus<MapT>) {
        this.#parentBus = parentBus ?? null;
    }

    publish<T extends keyof MapT>(type: T, data: MapT[T]): void {
        this.#events$.next({ type, data });

        // bubble up the event
        if (this.#parentBus) {
            this.#parentBus.publish(type, data);
        }
    }

    subscribe(callback: (event: UnionFromMap<MapT>) => void): () => void {
        // pipe just to make a copy
        const sub = this.#events$.pipe().subscribe(callback);

        return () => sub.unsubscribe();
    }
}

/** Default top-level event bus */
export const DEFAULT_BUS = new EventBus<DaraEventMap>();

const EventBusContext = React.createContext<EventBus<DaraEventMap>>(DEFAULT_BUS);

/** Hook to get the event bus instance */
export function useEventBus(): EventBus<DaraEventMap> {
    return React.useContext(EventBusContext);
}

interface EventCapturerProps {
    children: React.ReactNode;
    /** callback to call when the event is captured */
    onEvent: (event: DaraEvent) => void;
}

/**
 * Component that captures events of a given type fired in its children
 * and calls the provided callback with the event data.
 */
export function EventCapturer({ children, onEvent }: EventCapturerProps): React.ReactNode {
    const parentBus = useEventBus();
    const bus = React.useMemo(() => new EventBus(parentBus), [parentBus]);

    React.useEffect(() => {
        return bus.subscribe(onEvent);
    }, [bus, onEvent]);

    return <EventBusContext.Provider value={bus}>{children}</EventBusContext.Provider>;
}
