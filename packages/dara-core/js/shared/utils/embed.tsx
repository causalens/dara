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
    return frame?.dataset?.daraPageId as string;
}

/**
 * Get token for the embedded Dara app.
 *
 * Embedded-token bootstrap has been removed from core auth, so this now always
 * returns null and session auth is sourced from cookies.
 */
export function getEmbedToken(): string | null {
    return null;
}

/**
 * Get the jwt token. Uses the embedded token if the app is embedded.
 */
export function getToken(): string | null {
    return null;
}

/**
 * Get the stable token key identifier used for in-memory session state.
 */
export function getTokenKey(): string {
    return DARA_JWT_TOKEN;
}
