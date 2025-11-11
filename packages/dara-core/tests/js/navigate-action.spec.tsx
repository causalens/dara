/* eslint-disable no-restricted-globals */
import type { Mock } from 'vitest';

import { NavigateTo } from '@/actions';
import type { NavigateToImpl, SingleVariable } from '@/types/core';

async function withMockHref(callback: (hrefSetter: Mock) => void | Promise<void>, hrefValue?: string): Promise<void> {
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
        await callback(mock);
    } finally {
        window.location = originalLocation;
    }
}

async function withMockOpen(callback: (openSetter: Mock) => void | Promise<void>): Promise<void> {
    const originalOpen = window.open;
    try {
        const mock = vi.fn();
        Object.defineProperty(window, 'open', {
            value: (url: string, target: string, features: string) => {
                mock(url, target, features);
            },
            writable: true,
        });
        await callback(mock);
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
    ])('should navigate relatively to "$url" using react router with options "$options"', async ({ url, options }) => {
        const ctx = {
            navigate: vi.fn(),
        };

        await NavigateTo(ctx as any, {
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
        async ({ url }) => {
            await withMockHref(async (hrefSetter) => {
                const ctx = {
                    navigate: vi.fn(),
                };

                await NavigateTo(ctx as any, {
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

    it('should navigate to same-origin absolute URLs using react router', async () => {
        const ctx = {
            navigate: vi.fn(),
        };

        await withMockHref(async () => {
            await NavigateTo(ctx as any, {
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

    it('should navigate to same-origin absolute URLs with base-url using react router', async () => {
        window.dara.base_url = '/app';
        const ctx = {
            navigate: vi.fn(),
        };

        await withMockHref(async () => {
            await NavigateTo(ctx as any, {
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
    ])('should navigate to string URL "$url" with new_tab using window.open', async ({ url }) => {
        const ctx = {
            navigate: vi.fn(),
        };

        await withMockHref(async () => {
            await withMockOpen((openMock) => {
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
        async ({ url }) => {
            const ctx = {
                navigate: vi.fn(),
            };

            await withMockHref(async () => {
                await withMockOpen(async (openMock) => {
                    await NavigateTo(ctx as any, {
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

    it('should resolve variables in the url', async () => {
        const param1: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'param1',
            nested: [],
            store: undefined,
            uid: 'param1',
        };
        const param2: SingleVariable<string> = {
            __typename: 'Variable',
            default: 'param2',
            nested: [],
            store: undefined,
            uid: 'param2',
        };

        const ctx = {
            navigate: vi.fn(),
            snapshot: {
                getPromise: vi.fn().mockImplementation((v) => {
                    // NOTE: this is coupled to how Recoil transforms atom keys right now
                    if (v.key === 'param1__null') {
                        return Promise.resolve('value1');
                    }
                    if (v.key === 'param2__null') {
                        return Promise.resolve('value2');
                    }
                    return Promise.reject(new Error(`Can't resolve variable: ${JSON.stringify(v)}`));
                }),
            },
        };

        await withMockHref(async () => {
            await NavigateTo(ctx as any, {
                __typename: 'ActionImpl',
                name: 'NavigateTo',
                new_tab: false,
                uid: 'uid',
                url: { pathname: ':param1/:param2/:param3', params: { param1, param2, param3: 'static' } },
            } satisfies NavigateToImpl);

            // called with resolved URL
            expect(ctx.navigate).toHaveBeenCalledWith(
                expect.objectContaining({ pathname: 'value1/value2/static' }),
                undefined
            );
        }, 'http://localhost:3000/test');
    });
});
