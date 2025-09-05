interface CacheEntry<T> {
    data: Promise<T>;
    timestamp: number;
}

export interface CacheOptions {
    defaultTimeout?: number;
}

export class SingleUseCache<T> {
    private cache = new Map<string, CacheEntry<T>>();

    private readonly defaultTimeout: number;

    constructor(options: CacheOptions = {}) {
        this.defaultTimeout = options.defaultTimeout ?? 5000;
    }

    private isEntryStale(entry: CacheEntry<T>, timeout?: number): boolean {
        const timeoutMs = timeout ?? this.defaultTimeout;
        return Date.now() - entry.timestamp > timeoutMs;
    }

    has(key: string, timeout?: number): boolean {
        const entry = this.cache.get(key);
        return entry ? !this.isEntryStale(entry, timeout) : false;
    }

    get(key: string, timeout?: number): Promise<T> | undefined {
        const entry = this.cache.get(key);
        if (!entry || this.isEntryStale(entry, timeout)) {
            return undefined;
        }
        // Single use
        this.delete(key);
        return entry.data;
    }

    set(key: string, value: Promise<T>): void {
        this.cache.set(key, {
            data: value,
            timestamp: Date.now(),
        });
    }

    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    setIfMissing(key: string, computeFn: () => Promise<T>, timeout?: number): void {
        // Check cache first WITHOUT consuming it - just check if valid entry exists
        const entry = this.cache.get(key);
        if (entry && !this.isEntryStale(entry, timeout)) {
            return; // Already cached and valid, nothing to do
        }

        // Create new computation and store it
        const promise = computeFn();
        this.set(key, promise);
    }

    size(): number {
        return this.cache.size;
    }

    keys(): IterableIterator<string> {
        return this.cache.keys();
    }

    entries(): Array<[string, T | Promise<T>]> {
        return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.data]);
    }
}
