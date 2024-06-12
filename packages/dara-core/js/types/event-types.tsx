import {
    ComponentInstance,
    DataVariable,
    DerivedDataVariable,
    DerivedVariable,
    SingleVariable,
    UrlVariable,
} from './core';

/**
 * Map of available global events,
 * format: {eventName: eventData}
 */
export interface DaraEventMap {
    SERVER_COMPONENT_LOADED: { name: string; uid: string; value: ComponentInstance };
    DERIVED_VARIABLE_LOADED: { variable: DerivedVariable; value: any };
    PLAIN_VARIABLE_LOADED: { variable: SingleVariable<any>; value: any };
    URL_VARIABLE_LOADED: { variable: UrlVariable<any>; value: any };
    DATA_VARIABLE_LOADED: { variable: DataVariable; value: any };
    DERIVED_DATA_VARIABLE_LOADED: { variable: DerivedDataVariable; value: any };
}

/**
 * Event type
 */
export type DaraEventType = keyof DaraEventMap;

/** Discriminated union of all available events */
export type DaraEvent = {
    [K in DaraEventType]: { type: K; data: DaraEventMap[K] };
}[DaraEventType];
