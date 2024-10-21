/**
 * Global state store, intended to be used as a singleton or in a context.
 * Supports a simple key-value store with subscriptions and async value replacement,
 * while ensuring that only one replacement is in progress at a time.
 */
class GlobalStore<TState extends Record<string, any>> {
    /**
     * Internal key-value state
     */
    #state: TState;

    /**
     * Locks for each key to ensure only one replacement is in progress at a time.
     * Each promise represents an ongoing replacement which will resolve to the new value or reject if replacement fails.
     */
    #locks: Record<keyof TState, Promise<TState[keyof TState]>>;

    /**
     * Subscribers for each key.
     */
    #subscribers: Record<keyof TState, ((val: TState[keyof TState]) => void)[]>;

    constructor() {
        this.#state = {} as TState;
        this.#locks = {} as Record<keyof TState, Promise<any>>;
        this.#subscribers = {} as Record<keyof TState, ((val: TState[keyof TState]) => void)[]>;
    }

    /**
     * Clear the store.
     * Removes all values and subscribers.
     */
    public clear(): void {
        this.#state = {} as TState;
        this.#locks = {} as Record<keyof TState, Promise<any>>;
        this.#subscribers = {} as Record<keyof TState, ((val: TState[keyof TState]) => void)[]>;
    }

    /**
     * Get the value for a key.
     * If the value is being replaced, the promise for the new value is returned.
     *
     * @param key - key to get value for
     */
    public async getValue<TKey extends keyof TState>(key: TKey): Promise<TState[TKey]> {
        if (this.#locks[key]) {
            return this.#locks[key] as Promise<TState[TKey]>;
        }

        return this.#state[key];
    }

    /**
     * Get the value for a key synchronously.
     * Even if the value is being replaced, the current value is returned.
     *
     * @param key - key to get value for
     */
    public getValueSync<TKey extends keyof TState>(key: TKey): TState[TKey] {
        return this.#state[key];
    }

    /**
     * Set the value for a key.
     *
     * @param key - key to set value for
     * @param value - value to set
     */
    public setValue(key: keyof TState, value: TState[keyof TState]): void {
        this.#state[key] = value;
        this.#notify(key, value);
    }

    /**
     * Replace the value for a key.
     * If the value is being replaced, the promise for the new value is returned.
     *
     * @param key - key to replace value for
     * @param fn - function to get the new value
     */
    public async replaceValue<TKey extends keyof TState>(
        key: TKey,
        fn: () => Promise<TState[TKey]>
    ): Promise<TState[TKey]> {
        // If there's already a replacement in progress, return the promise of the ongoing replacement
        if (this.#locks[key]) {
            return this.#locks[key] as Promise<TState[TKey]>;
        }

        // Create a new Promise to resolve to the replaced value
        // TODO: this can be Promise.withResolvers once it's more widely supported
        let unlock: (res: TState[TKey]) => void;
        let unlockError: (err: Error) => void;
        const lockPromise = new Promise<TState[TKey]>((resolve, reject) => {
            unlock = resolve;
            unlockError = reject;
        });

        // Store it for the given key so we can resolve other replacements/retrievals to the same promise
        this.#locks[key] = lockPromise;

        let result: TState[TKey];

        try {
            // Run the provided function to get the new value
            result = await fn();

            // On success - set the value (notifying subscribers) and resolve the 'lock' promise.
            // This resolves both the caller and other ongoing requests blocking on the lock to the new value.
            this.setValue(key, result);
            unlock(result);
        } catch (e) {
            // On error - error out the 'lock' promise.
            // This errors both the caller and other ongoing requests blocking on the lock.
            unlockError(e);
        } finally {
            // Clear the lock for the key so future replaceValue calls call the `fn` again
            delete this.#locks[key];
        }

        return lockPromise;
    }

    /**
     * Subscribe to changes to a key.
     *
     * @param key - key to subscribe to changes to
     * @param callback - callback invoked when the value is updated
     */
    public subscribe<TKey extends keyof TState>(key: TKey, callback: (val: TState[TKey]) => void): () => void {
        if (!this.#subscribers[key]) {
            this.#subscribers[key] = [];
        }

        this.#subscribers[key].push(callback);

        return () => {
            this.#subscribers[key] = this.#subscribers[key].filter((cb) => cb !== callback);
        };
    }

    /**
     * Notify all subscribers of a key that the value has changed.
     *
     * @param key - key to notify subscribers of
     * @param value - new value
     */
    #notify<TKey extends keyof TState>(key: TKey, value: TState[TKey]): void {
        if (this.#subscribers[key]) {
            this.#subscribers[key].forEach((cb) => cb(value));
        }
    }
}

export interface GlobalState {
    sessionToken: string;
}

const store = new GlobalStore<GlobalState>();

export default store;
