export class MockStorage {
    storage = new Map<string, string>();

    getItem(key: string): string {
        return this.storage.get(key);
    }

    setItem(key: string, val: string): void {
        this.storage.set(key, val);
    }

    clear(): void {
        this.storage.clear();
    }

    removeItem(key: string): void {
        this.storage.delete(key);
    }

    key(index: number): string | null {
        const keys = Array.from(this.storage.keys());
        return keys[index] || null;
    }

    // Custom method to get all keys
    getKeys(): string[] {
        return Array.from(this.storage.keys());
    }
}

export function mockLocalStorage(): void {
    const mockStorage = new MockStorage();
    // Proxy to intercept Object.keys() calls and return the keys of the storage
    const localStorageProxy = new Proxy(mockStorage, {
        // necessary so Object.keys() recognize as enumerable
        getOwnPropertyDescriptor(target, prop: any) {
            if (target.getKeys().includes(prop)) {
                return {
                    configurable: true,
                    enumerable: true,
                };
            }
            return Object.getOwnPropertyDescriptor(target, prop);
        },
        // necessary so Object.keys() can be intercepted to work with our definition of get keys
        ownKeys(target) {
            return target.getKeys();
        },
    });
    Object.defineProperty(global, 'localStorage', {
        value: localStorageProxy,
    });
}
