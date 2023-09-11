export const prependBaseUrl = (asset: string): string => {
    if (window.dara?.base_url) {
        return new URL(asset, window.dara.base_url).toString();
    }
    return asset;
};
