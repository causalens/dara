/**
 * Whether the Dara app is embedded within an IFrame
 */
export function isEmbedded(): boolean {
    const frame = window.frameElement as HTMLIFrameElement;
    return Boolean(frame?.dataset?.daraPageId);
}
