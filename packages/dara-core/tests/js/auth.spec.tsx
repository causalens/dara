import { resolveReferrer } from '@/auth/auth';
import { getAuthOriginRecommendation, shouldWarnAboutInsecureAuthOrigin } from '@/auth/origin-security';

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

describe('shouldWarnAboutInsecureAuthOrigin', () => {
    it('returns false for https origins', () => {
        expect(
            shouldWarnAboutInsecureAuthOrigin({
                hostname: 'example.com',
                protocol: 'https:',
            })
        ).toBe(false);
    });

    it('returns false for localhost over http', () => {
        expect(
            shouldWarnAboutInsecureAuthOrigin({
                hostname: 'localhost',
                protocol: 'http:',
            })
        ).toBe(false);
    });

    it('returns false for loopback over http', () => {
        expect(
            shouldWarnAboutInsecureAuthOrigin({
                hostname: '127.0.0.1',
                protocol: 'http:',
            })
        ).toBe(false);
    });

    it('returns true for non-localhost http origins', () => {
        expect(
            shouldWarnAboutInsecureAuthOrigin({
                hostname: '0.0.0.0',
                protocol: 'http:',
            })
        ).toBe(true);
    });
});

describe('getAuthOriginRecommendation', () => {
    it('recommends localhost when served from 0.0.0.0', () => {
        expect(
            getAuthOriginRecommendation({
                hash: '#abc',
                host: '0.0.0.0:8001',
                hostname: '0.0.0.0',
                pathname: '/app',
                protocol: 'http:',
                search: '?a=1',
            })
        ).toBe('http://localhost:8001/app?a=1#abc');
    });

    it('recommends https for non-localhost origins', () => {
        expect(
            getAuthOriginRecommendation({
                hash: '#section',
                host: 'example.com:8080',
                hostname: 'example.com',
                pathname: '/auth',
                protocol: 'http:',
                search: '?next=%2Fdashboard',
            })
        ).toBe('https://example.com:8080/auth?next=%2Fdashboard#section');
    });
});
