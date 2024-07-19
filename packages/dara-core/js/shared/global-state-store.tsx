class GlobalStore<TState extends Record<string, any>> {
    #state: TState;

    #locks: Record<keyof TState, Promise<TState[keyof TState]>>;

    #subscribers: Record<keyof TState, ((val: TState[keyof TState]) => void)[]>;

    constructor() {
        this.#state = {} as TState;
        this.#locks = {} as Record<keyof TState, Promise<any>>;
        this.#subscribers = {} as Record<keyof TState, ((val: TState[keyof TState]) => void)[]>;
    }

    public async getValue<TKey extends keyof TState>(key: TKey): Promise<TState[TKey]> {
        if (this.#locks[key]) {
            return this.#locks[key] as Promise<TState[TKey]>;
        }

        return this.#state[key];
    }

    public getValueSync<TKey extends keyof TState>(key: TKey): TState[TKey] {
        return this.#state[key];
    }

    /**
     * @param key - key to set value for
     * @param value - value to set
     */
    public setValue(key: keyof TState, value: TState[keyof TState]): void {
        this.#notify(key, value);
        this.#state[key] = value;
    }

    public async replaceValue<TKey extends keyof TState>(
        key: TKey,
        fn: () => Promise<TState[TKey]>
    ): Promise<TState[TKey]> {
        if (this.#locks[key]) {
            return this.#locks[key] as Promise<TState[TKey]>;
        }

        let unlock: (res: TState[TKey]) => void;
        let unlockError: (err: Error) => void;
        const lockPromise = new Promise<TState[TKey]>((resolve, reject) => {
            unlock = resolve;
            unlockError = reject;
        });

        this.#locks[key] = lockPromise;

        let result: TState[TKey];

        try {
            result = await fn();
            this.#state[key] = result;

            // success - notify subscribers, unlock pending promises and set the value
            this.#notify(key, result);
            unlock(result);
            this.setValue(key, result);
        } catch (e) {
            // error - error out pending promises and rethrow
            unlockError(e);
            throw e;
        } finally {
            delete this.#locks[key];
        }

        return result;
    }

    /**
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
