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
}

export function mockLocalStorage(): void {
    Object.defineProperty(global, 'localStorage', {
        value: new MockStorage(),
    });
}
