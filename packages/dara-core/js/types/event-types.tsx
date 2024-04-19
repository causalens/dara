/**
 * Map of available global events,
 * format: {eventName: eventData}
 *
 * Should be extended by internal features to add their own events, e.g.:
 *
 * ```ts
 * declare module 'path/to/this/module' {
 *   interface DaraEventMap {
 *       'myEvent': { myData: string }
 *   }
 * }
 * ```
 */
export interface DaraEventMap {}

/**
 * Event type
 */
export type DaraEventType = keyof DaraEventMap;

/** Discriminated union of all available events */
export type DaraEvent = {
    [K in DaraEventType]: { type: K; data: DaraEventMap[K] };
}[DaraEventType];
