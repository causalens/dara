import { type ActionHandler, type NavigateToImpl } from '@/types/core';

/**
 * Check whether the passed url is a valid url
 *
 * @param url the url to check
 */
function isValidHttpUrl(url: string): boolean {
    // Check if the url starts with a slash, which is a valid relative url
    if (url.startsWith('/')) {
        return true;
    }

    let newUrl;

    try {
        newUrl = new URL(url);
    } catch {
        return false;
    }

    return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
}

/**
 * Front-end handler for NavigateTo action.
 * Navigates to a specified URL.
 */
const NavigateTo: ActionHandler<NavigateToImpl> = (ctx, actionImpl): void => {
    const isValidUrl = isValidHttpUrl(actionImpl.url);

    if (!isValidUrl) {
        throw new Error(`Invalid URL: ${actionImpl.url}`);
    }

    if (actionImpl.new_tab) {
        window.open(actionImpl.url, actionImpl.new_tab ? '_blank' : undefined);
    } else {
        ctx.history.push(actionImpl.url);
    }
};

export default NavigateTo;
