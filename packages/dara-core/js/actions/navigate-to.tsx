import { getBasename } from '@/router/utils';
import { type ActionHandler, type NavigateToImpl } from '@/types/core';

const ABSOLUTE_URL_REGEX = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Strips the basename from the pathname
 *
 * From https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/utils.ts#L1511
 */
export function stripBasename(pathname: string, basename: string): string | null {
    if (basename === '/') {
        return pathname;
    }

    if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
        return null;
    }

    // We want to leave trailing slash behavior in the user's control, so if they
    // specify a basename with a trailing slash, we should support it
    const startIndex = basename.endsWith('/') ? basename.length - 1 : basename.length;
    const nextChar = pathname.charAt(startIndex);
    if (nextChar && nextChar !== '/') {
        // pathname does not start with basename/
        return null;
    }

    return pathname.slice(startIndex) || '/';
}

/**
 * Front-end handler for NavigateTo action.
 * Navigates to a specified URL.
 *
 * Absolute/relative and external/internal differentiation follows logic from react-router's Link component:
 * https://github.com/remix-run/react-router/blob/32d759958978b9fbae676806dd6c84ade9866746/packages/react-router/lib/dom/lib.tsx#L623-L658
 */
const NavigateTo: ActionHandler<NavigateToImpl> = (ctx, actionImpl): void => {
    const basename = getBasename();
    let isExternal = false;
    let to = actionImpl.url;

    // detect external URLs for absolute URLs
    if (typeof actionImpl.url === 'string' && ABSOLUTE_URL_REGEX.test(actionImpl.url)) {
        try {
            const currentUrl = new URL(window.location.href);
            const targetUrl = new URL(actionImpl.url);
            const path = stripBasename(targetUrl.pathname, basename);

            // same-origin absolute URLs are treated as relative
            if (targetUrl.origin === currentUrl.origin && path != null) {
                // Strip the protocol/origin/basename for same-origin absolute URLs
                to = path + targetUrl.search + targetUrl.hash;
            } else {
                isExternal = true;
            }
        } catch {
            throw new Error(`Invalid URL: ${actionImpl.url}`);
        }
    }

    if (isExternal && typeof to === 'string') {
        if (actionImpl.new_tab) {
            window.open(to, '_blank');
        } else {
            window.location.href = to;
        }
        return;
    }

    // use router navigate if the url is relative
    ctx.navigate(to, actionImpl.options);
};

export default NavigateTo;
