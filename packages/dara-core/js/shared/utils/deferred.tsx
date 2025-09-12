export interface Deferred<T> {
    /**
     * Resolve the deferred promise with a value
     */
    resolve: (value: T) => void;
    /**
     * Reject the deferred promise with an error
     */
    reject: (reason?: any) => void;
    /**
     * The status of the deferred promise
     */
    status: 'pending' | 'resolved' | 'rejected';
    /**
     * Get the value of the deferred promise, throwing if it's not resolved yet
     */
    getOrThrow(): T;
    /**
     * Get the value of the deferred promise, blocking if it's not resolved yet
     * */
    getValue(): Promise<T>;
}

class DeferredImpl<T> implements Deferred<T> {
    #resolve!: (value: T) => void;

    #reject!: (reason?: any) => void;

    #promise: Promise<T>;

    #status: 'pending' | 'resolved' | 'rejected';

    #error?: any;

    #value?: T;

    constructor() {
        this.#status = 'pending';
        this.#promise = new Promise<T>((res, rej) => {
            this.#resolve = res;
            this.#reject = rej;
        });
    }

    get status(): 'pending' | 'resolved' | 'rejected' {
        return this.#status;
    }

    getOrThrow(): T {
        if (this.status === 'pending') {
            throw new Error('Deferred not resolved');
        }
        if (this.status === 'rejected') {
            throw this.#error;
        }
        return this.#value!;
    }

    getValue(): Promise<T> {
        if (this.status === 'pending') {
            return this.#promise;
        }
        if (this.status === 'rejected') {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return Promise.reject(this.#error);
        }
        return Promise.resolve(this.#value!);
    }

    resolve(value: T): void {
        if (this.#status === 'resolved') {
            throw new Error('Deferred already resolved');
        } else if (this.#status === 'rejected') {
            throw new Error('Deferred already rejected');
        }
        this.#status = 'resolved';
        this.#value = value;
        this.#resolve(value);
    }

    reject(reason?: any): void {
        if (this.#status === 'resolved') {
            throw new Error('Deferred already resolved');
        } else if (this.#status === 'rejected') {
            throw new Error('Deferred already rejected');
        }
        this.#status = 'rejected';
        this.#error = reason;
        this.#reject(reason);
    }
}

/**
 * Create a deferred promise
 */
export function deferred<T>(): Deferred<T> {
    return new DeferredImpl<T>();
}

/**
 * Check if a value is a Deferred
 */
export function isDeferred<T = any>(value: any): value is Deferred<T> {
    // extra checks so instanceof doesn't throw
    return value && typeof value === 'object' && value instanceof DeferredImpl;
}
