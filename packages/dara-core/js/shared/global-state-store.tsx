/* eslint-disable class-methods-use-this */
/**
 * Global state store.
 *
 * Supports a simple key-value store with subscriptions and async value replacement,
 * while ensuring that only one replacement is in progress at a time.
 */
interface StoreSetMessage {
    key: string;
    type: 'set';
    value: string | null;
}

interface StoreClearMessage {
    type: 'clear';
}

type StoreMessage = StoreSetMessage | StoreClearMessage;

const STORE_CHANNEL_NAME = 'dara-global-store';
const STORE_LOCK_PREFIX = 'dara-global-store-lock:';

export class GlobalStore {
    /**
     * Values tracked in-memory for the current tab.
     */
    #values: Record<string, string | null>;

    /**
     * Locks for each key to ensure only one replacement is in progress at a time.
     * Each promise represents an ongoing replacement which will resolve to the new value or reject if replacement fails.
     */
    #locks: Record<string, Promise<string | null>>;

    /**
     * Subscribers for each key.
     */
    #subscribers: Record<string, ((val: string | null) => void)[]>;

    /**
     * Broadcast channel used to synchronize values across tabs.
     */
    #channel: BroadcastChannel;

    constructor() {
        this.#values = {};
        this.#locks = {};
        this.#subscribers = {};
        this.#channel = this.#createChannel();
    }

    /**
     * Construct a BroadcastChannel for cross-tab synchronization.
     */
    #createChannel(): BroadcastChannel {
        const channel = new BroadcastChannel(STORE_CHANNEL_NAME);
        channel.addEventListener('message', (e: MessageEvent<StoreMessage>) => {
            this.#handleBroadcastMessage(e.data);
        });
        return channel;
    }

    /**
     * Handle messages from other tabs.
     */
    #handleBroadcastMessage(message: StoreMessage): void {
        if (message.type === 'clear') {
            this.#clearLocalValues();
            return;
        }

        this.#setLocalValue(message.key, message.value);
    }

    /**
     * Notify subscribers for a given key.
     */
    #notifySubscribers(key: string, value: string | null): void {
        this.#subscribers[key]?.forEach((cb) => cb(value));
    }

    /**
     * Set a value locally without broadcasting.
     */
    #setLocalValue(key: string, value: string | null): void {
        if (value === null) {
            delete this.#values[key];
        } else {
            this.#values[key] = value;
        }

        this.#notifySubscribers(key, value);
    }

    /**
     * Clear all locally tracked values and notify subscribers.
     */
    #clearLocalValues(): void {
        const keys = Object.keys(this.#values);
        this.#values = {};
        keys.forEach((key) => {
            this.#notifySubscribers(key, null);
        });
    }

    /**
     * Create a namespaced lock name for a store key.
     */
    #getLockName(key: string): string {
        return `${STORE_LOCK_PREFIX}${key}`;
    }

    /**
     * Wait for any in-flight cross-tab replacement for this key to complete.
     */
    async #waitForCrossTabUnlock(key: string): Promise<void> {
        await navigator.locks.request(this.#getLockName(key), () => undefined);
    }

    /**
     * Run a callback guarded by a cross-tab lock for this key.
     */
    async #runWithCrossTabLock<T>(key: string, callback: () => Promise<T>): Promise<T> {
        return navigator.locks.request(this.#getLockName(key), () => callback());
    }

    /**
     * Clear the store.
     * Removes all values, locks and subscribers.
     */
    public clear(): void {
        this.#clearLocalValues();
        this.#locks = {};
        this.#subscribers = {};
        this.#channel.postMessage({ type: 'clear' } satisfies StoreClearMessage);
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

        await this.#waitForCrossTabUnlock(key);
        return this.getValueSync(key);
    }

    /**
     * Get the value for a key synchronously.
     * Even if the value is being replaced, the current value is returned.
     *
     * @param key - key to get value for
     */
    public getValueSync(key: string): string | null {
        return this.#values[key] ?? null;
    }

    /**
     * Set the value for a key.
     *
     * @param key - key to set value for
     * @param value - value to set
     */
    public setValue(key: string, value: string | null): void {
        this.#setLocalValue(key, value);
        this.#channel.postMessage({ key, type: 'set', value } satisfies StoreSetMessage);
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
        let unlock!: (res: string | null) => void;
        let unlockError!: (err: Error) => void;
        const lockPromise = new Promise<string | null>((resolve, reject) => {
            unlock = resolve;
            unlockError = reject;
        });

        // Store it for the given key so we can resolve other replacements/retrievals to the same promise
        this.#locks[key] = lockPromise;

        try {
            // Run the provided function to get the new value
            const result = await this.#runWithCrossTabLock(key, fn);

            // On success - set the value (notifying subscribers) and resolve the 'lock' promise.
            // This resolves both the caller and other ongoing requests blocking on the lock to the new value.
            this.setValue(key, result);
            unlock(result);
        } catch (e: unknown) {
            // On error - error out the 'lock' promise.
            // This errors both the caller and other ongoing requests blocking on the lock.
            unlockError(e instanceof Error ? e : new Error('Failed to replace value in the global store'));
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

        // Add the callback to the local subscribers list
        this.#subscribers[key].push(callback);

        // Cleanup the subscriptions
        return () => {
            const subscribers = this.#subscribers[key];
            if (!subscribers) {
                return;
            }

            const index = subscribers.findIndex((val) => val === callback);
            if (index >= 0) {
                subscribers.splice(index, 1);
            }
        };
    }
}

const store = new GlobalStore();

export default store;
