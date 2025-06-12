/* eslint-disable class-methods-use-this */
/**
 * Global state store. Acts as a wrapper around localStorage.
 *
 * Supports a simple key-value store with subscriptions and async value replacement,
 * while ensuring that only one replacement is in progress at a time.
 */
class GlobalStore {
    /**
     * Locks for each key to ensure only one replacement is in progress at a time.
     * Each promise represents an ongoing replacement which will resolve to the new value or reject if replacement fails.
     */
    #locks: Record<string, Promise<string | null>>;

    /**
     * Subscribers for each key.
     */
    #subscribers: Record<string, ((val: string | null) => void)[]>;

    constructor() {
        this.#locks = {} as Record<string, Promise<string>>;
        this.#subscribers = {} as Record<string, ((val: string | null) => void)[]>;
    }

    /**
     * Clear the store.
     * Removes all values and subscribers.
     */
    public clear(): void {
        this.#locks = {} as Record<string, Promise<string>>;
        this.#subscribers = {} as Record<string, ((val: string | null) => void)[]>;
    }

    /**
     * Get the value for a key.
     * If the value is being replaced, the promise for the new value is returned.
     *
     * @param key - key to get value for
     */
    public async getValue(key: string): Promise<string | null> {
        if (this.#locks[key]) {
            return this.#locks[key];
        }

        return localStorage.getItem(key);
    }

    /**
     * Get the value for a key synchronously.
     * Even if the value is being replaced, the current value is returned.
     *
     * @param key - key to get value for
     */
    public getValueSync(key: string): string | null {
        return localStorage.getItem(key);
    }

    /**
     * Set the value for a key.
     *
     * @param key - key to set value for
     * @param value - value to set
     */
    public setValue(key: string, value: string | null): void {
        if (value === null) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, value);
        }

        // Notify any local subscribers of a change in the value
        if (this.#subscribers[key]) {
            this.#subscribers[key].forEach((cb) => cb(value));
        }
    }

    /**
     * Replace the value for a key.
     * If the value is being replaced, the promise for the new value is returned.
     *
     * @param key - key to replace value for
     * @param fn - function to get the new value
     */
    public async replaceValue(key: string, fn: () => Promise<string>): Promise<string | null> {
        // If there's already a replacement in progress, return the promise of the ongoing replacement
        if (this.#locks[key]) {
            return this.#locks[key];
        }

        // Create a new Promise to resolve to the replaced value
        // TODO: this can be Promise.withResolvers once it's more widely supported
        let unlock!: (res: string) => void;
        let unlockError!: (err: Error) => void;
        const lockPromise = new Promise<string>((resolve, reject) => {
            unlock = resolve;
            unlockError = reject;
        });

        // Store it for the given key so we can resolve other replacements/retrievals to the same promise
        this.#locks[key] = lockPromise;

        let result: string;

        try {
            // Run the provided function to get the new value
            result = await fn();

            // On success - set the value (notifying subscribers) and resolve the 'lock' promise.
            // This resolves both the caller and other ongoing requests blocking on the lock to the new value.
            this.setValue(key, result);
            unlock(result);
        } catch (e: unknown) {
            // On error - error out the 'lock' promise.
            // This errors both the caller and other ongoing requests blocking on the lock.
            unlockError(e as Error);
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
    public subscribe(key: string, callback: (val: string | null) => void): () => void {
        if (!this.#subscribers[key]) {
            this.#subscribers[key] = [];
        }

        // create a subscription scoped to the key
        const subFunc = (e: StorageEvent): void => {
            if (e.storageArea === localStorage && e.key === key) {
                callback(e.newValue);
            }
        };

        // Add the callback to the local subscribers list
        // The storage event only fires when localStorage is changed from another document so we need to track changes
        // locally as well.
        this.#subscribers[key].push(callback);

        // Add a listener to the storage event for changes coming from other tabs
        window.addEventListener('storage', subFunc);

        // Cleanup the subscriptions
        return () => {
            window.removeEventListener('storage', subFunc);
            this.#subscribers[key]?.splice(
                this.#subscribers[key].findIndex((val) => val === callback),
                1
            );
        };
    }
}

const store = new GlobalStore();

export default store;
