/**
 * Clean up session storage cache.
 * Purges sessionStorage persisted values which are related to a different session than the current one.
 *
 * @param sessionIdentifier current session identifier
 */
function cleanSessionCache(sessionIdentifier: string): void {
    for (const storage of [sessionStorage, localStorage]) {
        const keys = Object.keys(storage);

        keys.forEach((key) => {
            // Remove keys related to a different Dara session
            if (key.startsWith('dara-session') && !key.startsWith(`dara-session-${sessionIdentifier}`)) {
                storage.removeItem(key);
            }
        });
    }
}

export default cleanSessionCache;
