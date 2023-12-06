/**
 * Clean up session storage cache.
 * Purges sessionStorage persisted values which are related to a different session than the current one.
 *
 * @param sessionToken current session token
 */
function cleanSessionCache(sessionToken: string): void {
    for (const storage of [sessionStorage, localStorage]) {
        const keys = Object.keys(storage);

        keys.forEach((key) => {
            // Remove keys related to a different Dara session
            if (key.startsWith('dara-session') && !key.startsWith(`dara-session-${sessionToken}`)) {
                storage.removeItem(key);
            }
        });
    }
}

export default cleanSessionCache;
