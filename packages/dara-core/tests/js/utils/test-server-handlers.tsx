// eslint-disable-next-line import/no-extraneous-dependencies
import { rest } from 'msw';

import { ActionDef, ComponentType, JsComponent, PyComponent } from '../../../js/types';
import type { DataFrameSchema } from '@/shared';

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
    TestPropsComponent: {
        js_module: '@test',
        name: 'TestPropsComponent',
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

const mockSchema: DataFrameSchema = {
    fields: [
        { name: '__col__1__col1', type: 'integer' },
        { name: '__col__2__col2', type: 'integer' },
        { name: '__col__3__col3', type: 'str' },
        { name: '__col__4__col4', type: 'str' },
        { name: '__index__0__index', type: 'integer' },
    ],
    primaryKey: ['__index__0__index'],
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
        const body = await req.json();
        return res(
            ctx.json({
                cache_key: JSON.stringify(body.values),
                value: body,
            })
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

export { handlers, mockActions, mockComponents, mockSchema };
