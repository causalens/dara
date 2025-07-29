import { BehaviorSubject } from 'rxjs';

type VariableUpdate =
    | { type: 'initial'; value: any }
    | { isReset: boolean; nodeKey: string; oldValue: any; type: 'update'; value: any };

/**
 * State synchronizer singleton
 *
 * Used to synchronize changes across atoms of the same family
 */
export class StateSynchronizer {
    #observers: Map<string, BehaviorSubject<VariableUpdate>>;

    constructor() {
        this.#observers = new Map<string, BehaviorSubject<VariableUpdate>>();
    }

    /**
     * Register a key in the state synchronizer
     *
     * @param key key to register
     * @param defaultValue value to register
     */
    register(key: string, defaultValue: any): void {
        if (!this.#observers.has(key)) {
            this.#observers.set(key, new BehaviorSubject({ type: 'initial', value: defaultValue } as VariableUpdate));
        }
    }

    /**
     * Check if a given key is registered in the state synchronizer
     *
     * @param key key to check if registered
     */
    isRegistered(key: string): boolean {
        return this.#observers.has(key);
    }

    /**
     * Get the current state for a given key
     *
     * @param key key to get the current value for
     */
    getCurrentState(key: string): VariableUpdate | null {
        if (!this.isRegistered(key)) {
            return null;
        }
        return this.#observers.get(key)!.getValue();
    }

    /**
     * Subscribe to changes on a given key
     *
     * @param key key to subscribe to
     */
    subscribe(key: string, subscription: Parameters<BehaviorSubject<VariableUpdate>['subscribe']>[0]): () => void {
        // If somehow the ended up with no listener here, register it with null value
        if (!this.isRegistered(key)) {
            this.register(key, null);
        }

        const sub = this.#observers.get(key)!.subscribe(subscription);
        return () => {
            sub.unsubscribe();

            // if no more observers, remove the listener
            if (this.#observers.get(key)!.observers.length === 0) {
                this.#observers.delete(key);
            }
        };
    }

    /**
     * Notify listeners for a given key
     *
     * @param key key to notify listeners for
     * @param update update to notify about
     */
    notify(key: string, update: VariableUpdate): void {
        // If somehow the ended up with no listener here, register it with null value
        if (!this.isRegistered(key)) {
            this.register(key, null);
        }
        this.#observers.get(key)!.next(update);
    }
}
