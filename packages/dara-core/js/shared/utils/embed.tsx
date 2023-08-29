export const DARA_JWT_TOKEN = 'dara-jwt-token';

/**
 * Whether the Dara app is embedded within an IFrame
 */
export function isEmbedded(): boolean {
    const frame = window.frameElement as HTMLIFrameElement;
    return frame && frame?.dataset?.daraPageId !== '';
}

/**
 * Get the token key used to persist the embedded token
 */
export function getEmbedTokenKey(): string {
    const frame = window.frameElement as HTMLIFrameElement;
    return frame?.dataset?.daraPageId;
}

/**
 * Get token for the embedded Dara app
 */
export function getEmbedToken(): string {
    return localStorage.getItem(getEmbedTokenKey());
}

/**
 * Get the jwt token. Uses the embedded token if the app is embedded.
 */
export function getToken(): string {
    if (isEmbedded()) {
        const embedToken = getEmbedToken();
        return embedToken;
    }

    return localStorage.getItem(DARA_JWT_TOKEN);
}

/**
 * Get the token key used to persist the jwt token. Uses the embedded token key if the app is embedded.
 */
export function getTokenKey(): string {
    if (isEmbedded()) {
        return getEmbedTokenKey();
    }

    return DARA_JWT_TOKEN;
}
