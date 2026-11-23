import { DownloadContent } from '@/actions';

describe('DownloadContent action', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each([
        ['', '/api/core/download'],
        ['/', '/api/core/download'],
        ['/app/', '/app/api/core/download'],
        [`${window.location.origin}/app`, '/app/api/core/download'],
    ])('downloads from the app base URL %j without opening a tab', async (baseUrl, pathname) => {
        vi.stubGlobal('dara', { base_url: baseUrl });
        const code = 'https://example.com/?other=value&code=wrong#fragment';
        const open = vi.spyOn(window, 'open');
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement
        ) {
            expect(document.body.contains(this)).toBe(true);
            expect(this.hidden).toBe(true);
            expect(this.hasAttribute('download')).toBe(true);
            expect(this.target).toBe('');
            const url = new URL(this.href);
            expect(url.origin).toBe(window.location.origin);
            expect(url.pathname).toBe(pathname);
            expect(Array.from(url.searchParams)).toEqual([['code', code]]);
            expect(url.hash).toBe('');
        });

        await DownloadContent({} as Parameters<typeof DownloadContent>[0], {
            __typename: 'ActionImpl',
            name: 'DownloadContent',
            code,
        });

        expect(click).toHaveBeenCalledTimes(1);
        expect(document.querySelector('a[download]')).toBeNull();
        expect(open).toHaveBeenCalledTimes(0);
    });
});
