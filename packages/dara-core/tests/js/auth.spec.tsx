import { resolveReferrer } from '@/auth/auth';
import { getAuthOriginRecommendation, shouldWarnAboutInsecureAuthContext } from '@/auth/origin-security';

describe('resolve_referrer', () => {
    const originalWindowLocation = window.location;

    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: new URL('https://test.com/test/route'),
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            enumerable: true,
            value: originalWindowLocation,
        });
    });

    it('should resolve the full path when no base_url is set', () => {
        window.dara = {
            base_url: 'https://test.com/',
        };

        expect(resolveReferrer()).toBe('%2Ftest%2Froute');
    });

    it("should remove the path part of the base_url when it's set", () => {
        window.dara = {
            base_url: 'https://test.com/test',
        };

        expect(resolveReferrer()).toBe('%2Froute');
    });
});

describe('shouldWarnAboutInsecureAuthContext', () => {
    it('returns false for secure contexts', () => {
        expect(
            shouldWarnAboutInsecureAuthContext({
                isSecureContext: true,
            })
        ).toBe(false);
    });

    it('returns true for insecure contexts', () => {
        expect(
            shouldWarnAboutInsecureAuthContext({
                isSecureContext: false,
            })
        ).toBe(true);
    });
});

describe('getAuthOriginRecommendation', () => {
    it('recommends localhost when served from 0.0.0.0', () => {
        expect(
            getAuthOriginRecommendation({
                host: '0.0.0.0:8001',
                hostname: '0.0.0.0',
                pathname: '/app',
            })
        ).toBe('http://localhost:8001/app');
    });

    it('recommends https for non-localhost origins', () => {
        expect(
            getAuthOriginRecommendation({
                host: 'example.com:8080',
                hostname: 'example.com',
                pathname: '/auth',
            })
        ).toBe('https://example.com:8080/auth');
    });

    it('does not append query params or hash fragments', () => {
        expect(
            getAuthOriginRecommendation({
                host: '0.0.0.0:8001',
                hostname: '0.0.0.0',
                pathname: '/login',
            })
        ).toBe('http://localhost:8001/login');
    });
});
