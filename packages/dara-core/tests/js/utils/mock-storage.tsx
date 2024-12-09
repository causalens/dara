export class MockStorage implements Storage {
    storage = new Map<string, string>();

    length = 0;

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

/**
 *
 * @returns a mock storage proxy to intercept Object.keys() calls and return the keys of the storage
 */
function createStorageProxy(): MockStorage {
    const mockStorage = new MockStorage();
    return new Proxy(mockStorage, {
        // necessary so Object.keys() recognize as enumerable
        getOwnPropertyDescriptor(target, prop: string) {
            if (target.getKeys().includes(prop)) {
                return {
                    configurable: true,
                    enumerable: true,
                };
            }
            return Object.getOwnPropertyDescriptor(target, prop);
        },
        // overwrites what happens when Object.keys() is called
        ownKeys(target) {
            return target.getKeys();
        },
    });
}

export function mockLocalStorage(): void {
    const localStorageProxy = createStorageProxy();
    const sessionStorageProxy = createStorageProxy();

    Object.defineProperty(global, 'localStorage', {
        value: localStorageProxy,
    });
    Object.defineProperty(global, 'sessionStorage', {
        value: sessionStorageProxy,
    });
}
