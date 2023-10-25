// eslint-disable-next-line import/no-extraneous-dependencies
import { rest } from 'msw';

import { ActionDef, ComponentType, JsComponent, PyComponent } from '../../../js/types';

const mockComponents: Record<string, JsComponent | PyComponent> = {
    ProgressTracker: {
        js_module: '@darajs/dara_core',
        name: 'ProgressTracker',
        py_module: 'dara_core',
        type: ComponentType.JS,
    },
    TemplateRoot: {
        js_module: '@darajs/dara_core',
        name: 'TemplateRoot',
        py_module: 'dara_core',
        type: ComponentType.JS,
    },
    TestComponent: {
        js_module: '@test',
        name: 'TestComponent',
        py_module: 'test',
        type: ComponentType.JS,
    },
    TestComponent2: {
        name: 'TestComponent2',
        type: ComponentType.PY,
    },
};
const mockActions: Record<string, ActionDef> = {
    DownloadContent: {
        js_module: '@darajs/dara_core',
        name: 'DownloadContent',
        py_module: 'dara_core',
    },
    NavigateTo: {
        js_module: '@darajs/dara_core',
        name: 'NavigateTo',
        py_module: 'dara_core',
    },
    ResetVariables: {
        js_module: '@darajs/dara_core',
        name: 'ResetVariables',
        py_module: 'dara_core',
    },
    SideEffect: {
        js_module: '@darajs/dara_core',
        name: 'SideEffect',
        py_module: 'dara_core',
    },
    Track: {
        js_module: '@darajs/dara_core',
        name: 'Track',
        py_module: 'dara_core',
    },
    TriggerVariable: {
        js_module: '@darajs/dara_core',
        name: 'TriggerVariable',
        py_module: 'dara_core',
    },
    UpdateVariable: {
        js_module: '@darajs/dara_core',
        name: 'UpdateVariable',
        py_module: 'dara_core',
    },
};

// These handlers return mock responses for all the requests made by the application
const handlers = [
    rest.get('/api/core/config', async (req, res, ctx) => {
        return res(
            ctx.json({
                template: 'default',
            })
        );
    }),
    rest.get('/api/core/actions', async (req, res, ctx) => {
        return res(ctx.json(mockActions));
    }),
    rest.get('/api/core/components', async (req, res, ctx) => {
        return res(ctx.json(mockComponents));
    }),
    rest.post('/api/core/components/:component', async (req, res, ctx) => {
        return res(
            ctx.json({
                data: {
                    name: 'RawString',
                    props: { content: `${String(req.params.component)}: ${JSON.stringify(req.body)}` },
                },
                lookup: {},
            })
        );
    }),
    rest.get('/api/core/template/:template', async (req, res, ctx) => {
        return res(
            ctx.json({
                data: {
                    layout: {
                        name: 'TemplateRoot',
                        props: {
                            frame: {
                                name: 'Frame',
                                props: {},
                            },
                            menu: {
                                name: 'Menu',
                                props: {},
                            },
                        },
                    },
                    name: 'default',
                },
                lookup: {},
            })
        );
    }),
    rest.post('/api/core/action/:uid', async (req, res, ctx) => {
        return res(
            ctx.json({
                execution_id: 'uid',
            })
        );
    }),
    rest.post('/api/core/derived-variable/:uid', async (req, res, ctx) => {
        return res(
            ctx.json({
                cache_key: JSON.stringify(req.body.values),
                value: req.body,
            })
        );
    }),
    // for some reason MSW does not understand nested path so we need to work around it
    rest.post('/api/core/data-variable/:uid*', async (req, res, ctx) => {
        if (req.url.pathname.endsWith('/count')) {
            return res(ctx.json(10));
        }

        return res(
            ctx.json([
                {
                    col1: 1,
                    col2: 6,
                    col3: 'a',
                    col4: 'f',
                },
                {
                    col1: 2,
                    col2: 5,
                    col3: 'b',
                    col4: 'e',
                },
                {
                    // fields required for DDV - so we can check they are sent
                    cache_key: req.body.cache_key,

                    // Append what filters were sent
                    filters: req.body.filters,

                    limit: req.url.searchParams.get('limit'),

                    offset: req.url.searchParams.get('offset'),
                    order_by: req.url.searchParams.get('order_by'),

                    // time of response to check for re-fetches
                    time: Date.now(),
                    ws_channel: req.body.ws_channel,
                },
            ])
        );
    }),
    rest.delete('/api/core/tasks/:taskId', async (req, res, ctx) => {
        return res(ctx.status(200));
    }),
    rest.get('/api/auth/user', async (req, res, ctx) => {
        return res(
            ctx.json({
                identity_email: 'test@causalens.com',
                identity_id: 'TEST_ID',
                identity_name: 'Test User',
            })
        );
    }),
];

export { handlers, mockActions, mockComponents };
