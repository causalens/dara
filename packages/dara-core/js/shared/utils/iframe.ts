/**
 * Whether the Dara app is rendered inside an iframe carrying Dara page metadata.
 */
export function isEmbedded(): boolean {
    const frame = window.frameElement as HTMLIFrameElement | null;
    return Boolean(frame?.dataset?.daraPageId);
}
