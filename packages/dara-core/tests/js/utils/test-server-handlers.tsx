// eslint-disable-next-line import/no-extraneous-dependencies
import { HttpResponse, http } from 'msw';

import type { DataFrameSchema } from '@/shared';

import type { ActionDef, JsComponent, PyComponent } from '../../../js/types';
import { ComponentType } from '../../../js/types';

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
    http.get('/api/core/config', async () => {
        return HttpResponse.json({
            template: 'default',
        });
    }),
    http.get('/api/core/actions', async () => {
        return HttpResponse.json(mockActions);
    }),
    http.get('/api/core/components', async () => {
        return HttpResponse.json(mockComponents);
    }),
    http.post('/api/core/components/:component', async (info) => {
        const body = await info.request.json();
        return HttpResponse.json({
            data: {
                name: 'RawString',
                props: { content: `${String(info.params.component)}: ${JSON.stringify(body)}` },
            },
            lookup: {},
        });
    }),
    http.get('/api/core/template/:template', async () => {
        return HttpResponse.json({
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
        });
    }),
    http.post('/api/core/action/:uid', async () => {
        return HttpResponse.json({
            execution_id: 'uid',
        });
    }),
    http.post('/api/core/derived-variable/:uid', async (info) => {
        const body = (await info.request.json()) as any;
        return HttpResponse.json({
            cache_key: JSON.stringify(body.values),
            value: body,
        });
    }),
    http.delete('/api/core/tasks/:taskId', async () => {
        return new HttpResponse(null, { status: 200 });
    }),
    http.get('/api/auth/user', async () => {
        return HttpResponse.json({
            identity_email: 'test@causalens.com',
            identity_id: 'TEST_ID',
            identity_name: 'Test User',
        });
    }),
];

export { handlers, mockActions, mockComponents, mockSchema };
