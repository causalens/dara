/* eslint-disable no-restricted-globals */
import type { Mock } from 'vitest';

import { NavigateTo } from '@/actions';
import type { NavigateToImpl } from '@/types/core';

function withMockHref(callback: (hrefSetter: Mock) => void, hrefValue?: string): void {
    const originalLocation = window.location;
    try {
        const mock = vi.fn();
        Object.defineProperty(window, 'location', {
            value: {
                ...window.location,
                get href() {
                    return hrefValue ?? originalLocation.href;
                },
                set href(value) {
                    mock(value);
                },
            },
            writable: true,
        });
        callback(mock);
    } finally {
        window.location = originalLocation;
    }
}

describe('NavigateTo action', () => {
    beforeEach(() => {
        window.dara = {
            base_url: '',
        } as any;
    });

    // string/object forms, relative links
    it.each([
        { url: './to' },
        { url: '../to' },
        { url: 'to', options: { replace: true } }, // check options are passed through
        { url: { pathname: './to' } },
        { url: { pathname: '../to' } },
        { url: { pathname: 'to' } },
    ])('should navigate relatively to "$url" using react router with options "$options"', ({ url, options }) => {
        const ctx = {
            navigate: vi.fn(),
        };

        NavigateTo(ctx as any, {
            __typename: 'ActionImpl',
            name: 'NavigateTo',
            new_tab: false,
            uid: 'uid',
            url,
            options
        } satisfies NavigateToImpl);
        // called with url, no options
        expect(ctx.navigate).toHaveBeenCalledWith(url, options);
    });

    it.each([{ url: 'https://google.com' }, { url: 'http://example.com' }])(
        'should navigate absolutely to "$url" using href',
        ({ url }) => {
            withMockHref((hrefSetter) => {
                const ctx = {
                    navigate: vi.fn(),
                };

                NavigateTo(ctx as any, {
                    __typename: 'ActionImpl',
                    name: 'NavigateTo',
                    new_tab: false,
                    uid: 'uid',
                    url,
                } satisfies NavigateToImpl);
                // called with url
                expect(hrefSetter).toHaveBeenCalledWith(url);
            });
        }
    );

    it('should navigate to same-origin absolute URLs using react router', () => {
        const ctx = {
            navigate: vi.fn(),
        };

        withMockHref(() => {
            NavigateTo(ctx as any, {
                __typename: 'ActionImpl',
                name: 'NavigateTo',
                new_tab: false,
                uid: 'uid',
                url: 'http://localhost:3000/another-page',
            } satisfies NavigateToImpl);
            // called with relative URL since it's same-origin
            expect(ctx.navigate).toHaveBeenCalledWith('/another-page', undefined);
        }, 'http://localhost:3000/test');
    });

    it('should navigate to same-origin absolute URLs with base-url using react router', () => {
        window.dara.base_url = '/app';
        const ctx = {
            navigate: vi.fn(),
        };

        withMockHref(() => {
            NavigateTo(ctx as any, {
                __typename: 'ActionImpl',
                name: 'NavigateTo',
                new_tab: false,
                uid: 'uid',
                url: 'http://localhost:3000/app/another-page',
            } satisfies NavigateToImpl);
            // called with relative URL since it's same-origin
            expect(ctx.navigate).toHaveBeenCalledWith('/another-page', undefined);
        }, 'http://localhost:3000/app/test');
    });
});
