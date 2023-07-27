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
