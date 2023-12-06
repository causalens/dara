/**
 * Clean up session storage cache.
 * Purges sessionStorage persisted values which are related to a different session than the current one.
 *
 * @param sessionToken current session token
 */
function cleanSessionCache(sessionToken: string): void {
    const sessionKeys = Object.keys(sessionStorage);
    const localKeys = Object.keys(localStorage);

    sessionKeys.forEach((key) => {
        // Remove keys related to a different Dara session
        if (key.startsWith('dara-session') && !key.startsWith(`dara-session-${sessionToken}`)) {
            sessionStorage.removeItem(key);
        }
    });

    localKeys.forEach((key) => {
        // Remove keys related to a different Dara session such as persisted Variables
        if (key.startsWith('dara-session') && !key.startsWith(`dara-session-${sessionToken}`)) {
            localStorage.removeItem(key);
        }
    });
}

export default cleanSessionCache;
