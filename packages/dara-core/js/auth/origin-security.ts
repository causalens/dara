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
    let host = location.host;
    // Empty hosts need the same fallback as missing hosts.
    // oxlint-disable-next-line typescript/prefer-nullish-coalescing
    if (!host) {
        host = location.hostname;
    }
    const pathname = location.pathname ?? '';

    if (location.hostname.toLowerCase() === '0.0.0.0') {
        const localhostHost = host.replace(/^0\.0\.0\.0/i, 'localhost');
        return `http://${localhostHost}${pathname}`;
    }

    return `https://${host}${pathname}`;
}
