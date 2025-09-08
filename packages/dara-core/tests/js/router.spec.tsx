import { findFirstPath } from '@/router';
import type { RouteDefinition } from '@/types/core';

describe('findFirstPath', () => {
    describe('simple scenarios', () => {
        it('should return empty path for index route at root', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'IndexRoute',
                    id: 'index-1',
                    case_sensitive: false,
                    index: true,
                    full_path: '/',
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/');
        });

        it('should return page path for single page route', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PageRoute',
                    id: 'page-1',
                    case_sensitive: false,
                    path: 'dashboard',
                    children: [],
                    full_path: '/dashboard',
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/dashboard');
        });

        it('should prefer index route over page route', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PageRoute',
                    id: 'page-1',
                    case_sensitive: false,
                    path: 'dashboard',
                    children: [],
                    full_path: '/dashboard',
                },
                {
                    __typename: 'IndexRoute',
                    id: 'index-1',
                    case_sensitive: false,
                    index: true,
                    full_path: '/',
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/');
        });

        it('should return first page route when multiple pages exist', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PageRoute',
                    id: 'page-1',
                    case_sensitive: false,
                    path: 'first',
                    children: [],
                    full_path: '/first',
                },
                {
                    __typename: 'PageRoute',
                    id: 'page-2',
                    case_sensitive: false,
                    path: 'second',
                    children: [],
                    full_path: '/second',
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/first');
        });
    });

    describe('nested scenarios with layouts and prefixes', () => {
        it('should traverse layout route to find nested page', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'LayoutRoute',
                    id: 'layout-1',
                    case_sensitive: false,
                    full_path: '/',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-1',
                            case_sensitive: false,
                            path: 'dashboard',
                            children: [],
                            full_path: '/dashboard',
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/dashboard');
        });

        it('should traverse prefix route and accumulate path', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PrefixRoute',
                    id: 'prefix-1',
                    case_sensitive: false,
                    path: 'admin',
                    full_path: '/admin',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-1',
                            case_sensitive: false,
                            path: 'users',
                            children: [],
                            full_path: '/admin/users',
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/admin/users');
        });

        it('should prefer index in nested structure', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PrefixRoute',
                    id: 'prefix-1',
                    case_sensitive: false,
                    path: 'admin',
                    full_path: '/admin',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-1',
                            case_sensitive: false,
                            path: 'users',
                            children: [],
                            full_path: '/admin/users',
                        },
                        {
                            __typename: 'IndexRoute',
                            id: 'index-1',
                            case_sensitive: false,
                            index: true,
                            full_path: '/admin',
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/admin');
        });
    });

    describe('complex nested scenarios', () => {
        it('should handle deeply nested structure with mixed route types', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'LayoutRoute',
                    id: 'layout-1',
                    case_sensitive: false,
                    full_path: '/',
                    children: [
                        {
                            __typename: 'PrefixRoute',
                            id: 'prefix-1',
                            case_sensitive: false,
                            path: 'admin',
                            full_path: '/admin',
                            children: [
                                {
                                    __typename: 'LayoutRoute',
                                    id: 'layout-2',
                                    case_sensitive: false,
                                    full_path: '/admin',
                                    children: [
                                        {
                                            __typename: 'PageRoute',
                                            id: 'page-1',
                                            case_sensitive: false,
                                            path: 'dashboard',
                                            children: [],
                                            full_path: '/admin/dashboard',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/admin/dashboard');
        });

        it('should handle page route with nested children and prefer index', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PageRoute',
                    id: 'page-1',
                    case_sensitive: false,
                    path: 'dashboard',
                    full_path: '/dashboard',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-2',
                            case_sensitive: false,
                            path: 'analytics',
                            children: [],
                            full_path: '/dashboard/analytics',
                        },
                        {
                            __typename: 'IndexRoute',
                            id: 'index-1',
                            case_sensitive: false,
                            index: true,
                            full_path: '/dashboard',
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/dashboard');
        });

        it('should handle route with nested children but no index', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PrefixRoute',
                    id: 'page-1',
                    case_sensitive: false,
                    path: 'dashboard',
                    full_path: '/dashboard',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-2',
                            case_sensitive: false,
                            path: 'analytics',
                            children: [],
                            full_path: '/dashboard/analytics',
                        },
                        {
                            __typename: 'PageRoute',
                            id: 'page-3',
                            case_sensitive: false,
                            path: 'reports',
                            children: [],
                            full_path: '/dashboard/reports',
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/dashboard/analytics');
        });

        it('should handle multiple top-level routes and prefer first navigatable', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'LayoutRoute',
                    id: 'layout-1',
                    case_sensitive: false,
                    full_path: '/',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-1',
                            case_sensitive: false,
                            path: 'deep-page',
                            children: [],
                            full_path: '/deep-page',
                        },
                    ],
                },
                {
                    __typename: 'PageRoute',
                    id: 'page-2',
                    case_sensitive: false,
                    path: 'shallow-page',
                    children: [],
                    full_path: '/shallow-page',
                },
                {
                    __typename: 'IndexRoute',
                    id: 'index-1',
                    case_sensitive: false,
                    index: true,
                    full_path: '/',
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/'); // Index route wins
        });

        it('should handle convoluted nesting with BFS order preference', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'LayoutRoute',
                    id: 'layout-1',
                    case_sensitive: false,
                    full_path: '/',
                    children: [
                        {
                            __typename: 'PrefixRoute',
                            id: 'prefix-1',
                            case_sensitive: false,
                            path: 'level1',
                            full_path: '/level1',
                            children: [
                                {
                                    __typename: 'PrefixRoute',
                                    id: 'prefix-2',
                                    case_sensitive: false,
                                    path: 'level2',
                                    full_path: '/level1/level2',
                                    children: [
                                        {
                                            __typename: 'PageRoute',
                                            id: 'page-deep',
                                            case_sensitive: false,
                                            path: 'deep',
                                            children: [],
                                            full_path: '/level1/level2/deep',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
                {
                    __typename: 'PrefixRoute',
                    id: 'prefix-3',
                    case_sensitive: false,
                    path: 'shallow',
                    full_path: '/shallow',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-shallow',
                            case_sensitive: false,
                            path: 'page',
                            children: [],
                            full_path: '/shallow/page',
                        },
                    ],
                },
            ];

            // BFS should find the shallower path first
            const result = findFirstPath(routes);
            expect(result).toBe('/shallow/page');
        });

        it('should return page route immediately without considering children', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PageRoute',
                    id: 'page-1',
                    case_sensitive: false,
                    path: 'products',
                    full_path: '/products',
                    children: [
                        {
                            __typename: 'IndexRoute',
                            id: 'index-nested',
                            case_sensitive: false,
                            index: true,
                            full_path: '/products',
                        },
                        {
                            __typename: 'PageRoute',
                            id: 'page-nested',
                            case_sensitive: false,
                            path: 'details',
                            children: [],
                            full_path: '/products/details',
                        },
                        {
                            __typename: 'LayoutRoute',
                            id: 'layout-1',
                            case_sensitive: false,
                            full_path: '/products',
                            children: [
                                {
                                    __typename: 'PageRoute',
                                    id: 'page-deep-nested',
                                    case_sensitive: false,
                                    path: 'reviews',
                                    children: [],
                                    full_path: '/products/reviews',
                                },
                            ],
                        },
                    ],
                },
            ];

            // Should return the page route path immediately, not traverse into children
            // even though children contain index and other page routes
            const result = findFirstPath(routes);
            expect(result).toBe('/products');
        });
    });

    describe('edge cases', () => {
        it('should return empty string for empty routes array', () => {
            const result = findFirstPath([]);
            expect(result).toBe('/');
        });

        it('should handle routes with only layout/prefix but no navigatable endpoints', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'LayoutRoute',
                    id: 'layout-1',
                    case_sensitive: false,
                    full_path: '/',
                    children: [
                        {
                            __typename: 'PrefixRoute',
                            id: 'prefix-1',
                            case_sensitive: false,
                            path: 'admin',
                            children: [],
                            full_path: '/admin',
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/');
        });
    });

    describe('path normalization', () => {
        it('should clean paths with leading/trailing slashes', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PrefixRoute',
                    id: 'prefix-1',
                    case_sensitive: false,
                    path: '/admin/',
                    full_path: '/admin',
                    children: [
                        {
                            __typename: 'PageRoute',
                            id: 'page-1',
                            case_sensitive: false,
                            path: '/users/',
                            children: [],
                            full_path: '/admin/users',
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/admin/users');
        });

        it('should handle mixed slash patterns correctly', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PrefixRoute',
                    id: 'prefix-1',
                    case_sensitive: false,
                    path: 'api/',
                    full_path: '/api',
                    children: [
                        {
                            __typename: 'PrefixRoute',
                            id: 'prefix-2',
                            case_sensitive: false,
                            path: '/v1',
                            full_path: '/api/v1',
                            children: [
                                {
                                    __typename: 'PageRoute',
                                    id: 'page-1',
                                    case_sensitive: false,
                                    path: '/status/',
                                    children: [],
                                    full_path: '/api/v1/status',
                                },
                            ],
                        },
                    ],
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/api/v1/status');
        });

        it('should handle parent path with trailing slash', () => {
            const routes: RouteDefinition[] = [
                {
                    __typename: 'PageRoute',
                    id: 'page-1',
                    case_sensitive: false,
                    path: '/dashboard',
                    children: [],
                    full_path: '/dashboard',
                },
            ];

            const result = findFirstPath(routes);
            expect(result).toBe('/dashboard');
        });
    });

    it('should handle routes with only layoutprefix but no navigatable endpoints', () => {
        const routes: RouteDefinition[] = [
            {
                __typename: 'LayoutRoute',
                id: 'layout-1',
                case_sensitive: false,
                full_path: '/',
                children: [
                    {
                        __typename: 'PrefixRoute',
                        id: 'prefix-1',
                        case_sensitive: false,
                        path: 'admin',
                        children: [],
                        full_path: '/admin',
                    },
                ],
            },
        ];

        const result = findFirstPath(routes);
        expect(result).toBe('/');
    });
});
