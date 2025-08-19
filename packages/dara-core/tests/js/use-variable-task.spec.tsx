import { type Matcher, type MatcherOptions, act, fireEvent, render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';

import { useVariable } from '../../js/shared';
import { VariableCtx } from '../../js/shared/context';
import GlobalTaskProvider, { type VariableTaskEntry } from '../../js/shared/context/global-task-context';
import { type VariableContext } from '../../js/shared/context/variable-context';
import { getIdentifier } from '../../js/shared/utils/normalization';
import type { DerivedVariable, SingleVariable, Variable } from '../../js/types';
import { Wrapper, server } from './utils';
import { mockLocalStorage } from './utils/mock-storage';

// Mock lodash debounce out so it doesn't cause timing issues in the tests
vi.mock('lodash/debounce', () => vi.fn((fn) => fn));

mockLocalStorage();

// Mock component to test interaction between variables
const MockComponent = (props: { derivedVar: DerivedVariable; variableA: Variable<number> }): JSX.Element => {
    const [a, setA] = useVariable(props.variableA);
    const [c] = useVariable(props.derivedVar);

    return (
        <div>
            <input data-testid="a" onChange={(e) => setA(Number(e.target.value))} value={a} />
            <span data-testid="c">{JSON.stringify(c)}</span>
        </div>
    );
};

// Used to mock Tasks contexts
const getMockTaskContexts = (
    varUids: Array<string>
): [{ tasks: Set<string>; variableTaskMap: Map<string, VariableTaskEntry[]> }, VariableContext] => {
    const tasks: Set<string> = new Set();
    const map = new Map();

    varUids.forEach((v) => {
        tasks.add(v);
        map.set(v, [{ taskId: `t_${v}` }]);
    });

    return [{ tasks, variableTaskMap: map }, { variables: { current: new Set(varUids) } }];
};

// Mocks task response based on variable value
const mockTaskResponse = (varAValue: number): void => {
    server.use(
        http.get('/api/core/tasks/:taskId', async (info) => {
            return HttpResponse.json(
                JSON.parse(
                    `{"force_key":null,"values":{"data":[{"__ref":"Variable:a"}],"lookup":{"Variable:a":${varAValue.toString()}}},"ws_channel":"uid","task_id":"t_none"}`
                )
            );
        })
    );
};

// Helper to init the MockComponent and check its initial state
async function initComponent(
    varA: Variable<any>,
    derivedVar: DerivedVariable
): Promise<(id: Matcher, options?: MatcherOptions) => HTMLElement> {
    mockTaskResponse(1);
    const [taskCtx, variablesCtx] = getMockTaskContexts([derivedVar.uid]);
    const { getByTestId } = render(
        <Wrapper withTaskCtx={false}>
            <GlobalTaskProvider tasks={taskCtx.tasks} variableTaskMap={taskCtx.variableTaskMap}>
                <VariableCtx.Provider value={variablesCtx}>
                    <MockComponent derivedVar={derivedVar} variableA={varA} />
                </VariableCtx.Provider>
            </GlobalTaskProvider>
        </Wrapper>
    );
    await waitFor(() => expect(getByTestId('c')).toBeVisible());
    const result = getByTestId('c').innerHTML;
    expect(result).toContain(
        `{"force_key":null,"values":{"data":[{"__ref":"${getIdentifier(varA)}"}],"lookup":{"${getIdentifier(
            varA
        )}":1}},"ws_channel":"uid","task_id":"t_${derivedVar.uid}"}`
    );
    return getByTestId;
}
// Helper to update a given input in the component
const updateInput = async (
    inputId: string,
    value: number,
    getter: (_props: any) => HTMLElement,
    resultTestId = 'c'
): Promise<Record<string, any>> => {
    act(() => {
        const input = getter(inputId);
        fireEvent.change(input, { target: { value } });
    });
    mockTaskResponse(2);
    await waitFor(() => expect(getter('c')).toBeVisible());
    return JSON.parse(getter(resultTestId).innerHTML);
};

// Dummy variable
const variableA: SingleVariable<number> = {
    __typename: 'Variable',
    default: 1,
    nested: [],
    uid: 'a',
};

describe('useVariableRunAsTask', () => {
    beforeAll(() => {
        server.listen();
    });

    beforeEach(() => {
        window.localStorage.clear();
        server.use(
            http.post('/api/core/derived-variable/:uid', async (info) => {
                const { uid } = info.params;
                return HttpResponse.json({
                    cache_key: JSON.stringify(((await info.request.json()) as any)!.values),
                    task_id: `t_${String(uid)}`,
                });
            })
        );
        vi.restoreAllMocks();
    });
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    it('should update DerivedVariable with results obtained from task', async () => {
        const variableNone: DerivedVariable = {
            __typename: 'DerivedVariable',
            deps: [variableA],
            nested: [],
            uid: 'none',
            variables: [variableA],
        };

        const getter = await initComponent(variableA, variableNone);

        const result = await updateInput('a', 2, getter);
        expect(result).toEqual({
            force_key: null,
            task_id: 't_none',
            values: { data: [{ __ref: 'Variable:a' }], lookup: { 'Variable:a': 2 } },
            ws_channel: 'uid',
        });
    });
});
