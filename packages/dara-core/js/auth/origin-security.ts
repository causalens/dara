interface LocationLike {
    protocol: string;
    hostname: string;
}

function isLoopbackHostname(hostname: string): boolean {
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
        return true;
    }

    if (normalizedHostname === '::1' || normalizedHostname === '[::1]') {
        return true;
    }

    return normalizedHostname.startsWith('127.');
}

/**
 * Secure auth cookies require HTTPS in production.
 * Browsers allow localhost/loopback HTTP for local development.
 */
export function shouldWarnAboutInsecureAuthOrigin(location: LocationLike): boolean {
    if (location.protocol === 'https:') {
        return false;
    }

    return !isLoopbackHostname(location.hostname);
}

