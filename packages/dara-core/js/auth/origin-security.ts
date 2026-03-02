interface LocationLike {
    host?: string;
    hostname: string;
    pathname?: string;
}

interface SecurityContextLike {
    isSecureContext: boolean;
}

export function shouldWarnAboutInsecureAuthContext(securityContext: SecurityContextLike): boolean {
    return !securityContext.isSecureContext;
}

export function getAuthOriginRecommendation(location: LocationLike): string {
    const host = location.host || location.hostname;
    const pathname = location.pathname || '';

    if (location.hostname.toLowerCase() === '0.0.0.0') {
        const localhostHost = host.replace(/^0\.0\.0\.0/i, 'localhost');
        return `http://${localhostHost}${pathname}`;
    }

    return `https://${host}${pathname}`;
}
