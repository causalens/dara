interface LocationLike {
    hash?: string;
    host?: string;
    protocol: string;
    hostname: string;
    pathname?: string;
    search?: string;
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

function getLocationSuffix(location: LocationLike): string {
    return `${location.pathname || ''}${location.search || ''}${location.hash || ''}`;
}

export function getAuthOriginRecommendation(location: LocationLike): string {
    const host = location.host || location.hostname;

    if (location.hostname.toLowerCase() === '0.0.0.0') {
        const localhostHost = host.replace(/^0\.0\.0\.0/i, 'localhost');
        return `http://${localhostHost}${getLocationSuffix(location)}`;
    }

    return `https://${host}${getLocationSuffix(location)}`;
}
