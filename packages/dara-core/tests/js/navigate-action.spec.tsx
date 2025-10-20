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

function withMockOpen(callback: (openSetter: Mock) => void): void {
    const originalOpen = window.open;
    try {
        const mock = vi.fn();
        Object.defineProperty(window, 'open', {
            value: (url: string, target: string, features: string) => {
                mock(url, target, features);
            },
            writable: true,
        });
        callback(mock);
    } finally {
        window.open = originalOpen;
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
            options,
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

    it.each([
        { url: './to' },
        { url: '../to' },
        { url: 'https://google.com' },
        { url: 'http://localhost:3000/another-page' },
    ])('should navigate to string URL "$url" with new_tab using window.open', ({ url }) => {
        const ctx = {
            navigate: vi.fn(),
        };

        withMockHref(() => {
            withMockOpen((openMock) => {
                NavigateTo(ctx as any, {
                    __typename: 'ActionImpl',
                    name: 'NavigateTo',
                    new_tab: true,
                    uid: 'uid',
                    url,
                } satisfies NavigateToImpl);

                // called window.open with url
                expect(openMock).toHaveBeenCalledWith(url, '_blank', undefined);

                // router navigation is never used with new_tab
                expect(ctx.navigate).not.toHaveBeenCalled();
            });
        }, 'http://localhost:3000/test');
    });

    it.each([{ url: { pathname: '../to' } }, { url: { pathname: 'to' } }])(
        'should navigate to object URL "$url" with new_tab using window.open',
        ({ url }) => {
            const ctx = {
                navigate: vi.fn(),
            };

            withMockHref(() => {
                withMockOpen((openMock) => {
                    NavigateTo(ctx as any, {
                        __typename: 'ActionImpl',
                        name: 'NavigateTo',
                        new_tab: true,
                        uid: 'uid',
                        url,
                    } satisfies NavigateToImpl);

                    const expectedUrl = new URL(url.pathname, window.location.origin);

                    // called window.open with url
                    expect(openMock).toHaveBeenCalledWith(expectedUrl.toString(), '_blank', undefined);

                    // router navigation is never used with new_tab
                    expect(ctx.navigate).not.toHaveBeenCalled();
                });
            }, 'http://localhost:3000/test');
        }
    );
});
