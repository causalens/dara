/**
 * Prepend window.dara.base_url to asset path if defined.
 * This is required for static assets to be loaded correctly when the app is not hosted at the root of the domain.
 *
 * Since all static assets are server from `/static/`, this is only applied to asset paths that start with `/static/`.
 * This way we're not affecting any other assets that are loaded from other domains.
 *
 * @param asset asset URL
 */
export const prependBaseUrl = (asset: string): string => {
    if (window.dara?.base_url && asset.startsWith('/static/')) {
        const baseUrl = new URL(window.dara.base_url, window.location.origin);
        const assetUrl = new URL(asset, baseUrl.origin);
        assetUrl.pathname = [baseUrl.pathname, assetUrl.pathname].join('/').replace(/\/+/g, '/');
        return assetUrl.toString();
    }
    return asset;
};
