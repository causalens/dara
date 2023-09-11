export const prependBaseUrl = (asset: string): string => {
    if (window.dara?.base_url) {
        const baseUrl = new URL(window.dara.base_url);
        const assetUrl = new URL(asset, baseUrl.origin);
        assetUrl.pathname = [baseUrl.pathname, assetUrl.pathname].join('/').replace(/\/+/g, '/');
        return assetUrl.toString();
    }
    return asset;
};
