/**
 * Model-based tests for request ownership and caching across mounts.
 *
 * fast-check generates sequences of user-visible events (mounting and unmounting
 * consumers, changing an input, answering server requests, letting time pass)
 * and runs them against the real React, Recoil and poller code. The server holds
 * every request until a command answers it, and derives each response from the
 * request's input, so a value cached for the wrong input is visible.
 *
 * Properties:
 * - Safety: no consumer shows an error at any step.
 * - Liveness: once every request is answered, every mounted consumer shows the
 *   value for the current input.
 *
 * Consumers: a DerivedVariable read by a component that owns its request, a
 * Variable whose default is that DerivedVariable (it reads the DerivedVariable
 * without owning the request), and a py_component.
 */
import { act, render } from '@testing-library/react';
import fc from 'fast-check';
import { HttpResponse, http } from 'msw';
import { Suspense, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { VariableCtx } from '@/shared/context';
import { usePollScope } from '@/shared/interactivity/polling';
import { clearRegistries_TEST } from '@/shared/interactivity/store';

import { DynamicComponent, clearCaches_TEST, useVariable } from '../../js/shared';
import type { DerivedVariable, SingleVariable, Variable } from '../../js/types';
import type { PyComponentInstance } from '../../js/types/core';
import { Wrapper, server } from './utils';

type Target = 'owned' | 'reader' | 'python';

type Command =
    | { kind: 'toggle'; target: Target }
    | { kind: 'input'; value: number }
    | { kind: 'respond'; which: 'oldest' | 'newest' | 'all' }
    | { kind: 'tick'; ms: number };

// Mounting and unmounting is where ownership changes, so it is generated most often. The
// 5ms tick is shorter than the DerivedVariable request debounce; 1100ms passes a poll interval.
const commandArb: fc.Arbitrary<Command> = fc.oneof(
    {
        arbitrary: fc.record({
            kind: fc.constant('toggle' as const),
            target: fc.constantFrom<Target>('owned', 'reader', 'python'),
        }),
        weight: 4,
    },
    { arbitrary: fc.record({ kind: fc.constant('input' as const), value: fc.integer({ min: 1, max: 3 }) }), weight: 2 },
    {
        arbitrary: fc.record({
            kind: fc.constant('respond' as const),
            which: fc.constantFrom('oldest' as const, 'newest' as const, 'all' as const),
        }),
        weight: 2,
    },
    {
        arbitrary: fc.record({ kind: fc.constant('tick' as const), ms: fc.constantFrom(0, 5, 20, 300, 1100) }),
        weight: 3,
    }
);

/**
 * Sequences that failed before the fixes they are named after.
 *
 * They run on every test run, ahead of the generated ones.
 */
const KNOWN_FAILURES: Array<[string, Command[]]> = [
    [
        'a remounted py_component reused its aborted first request as an error',
        [
            { kind: 'toggle', target: 'python' },
            { kind: 'toggle', target: 'python' },
            { kind: 'toggle', target: 'python' },
        ],
    ],
    [
        'a remounted DerivedVariable reused the value for the previous input',
        [
            { kind: 'respond', which: 'all' },
            { kind: 'tick', ms: 20 },
            { kind: 'input', value: 2 },
            { kind: 'tick', ms: 20 },
            { kind: 'toggle', target: 'owned' },
            { kind: 'toggle', target: 'owned' },
        ],
    ],
    [
        'a remounted py_component reused the value for the previous input',
        [
            { kind: 'toggle', target: 'python' },
            { kind: 'respond', which: 'all' },
            { kind: 'tick', ms: 20 },
            { kind: 'input', value: 2 },
            { kind: 'tick', ms: 20 },
            { kind: 'toggle', target: 'python' },
            { kind: 'toggle', target: 'python' },
        ],
    ],
    [
        'a Variable with a DerivedVariable default kept refetching and showed the value for an older input',
        [
            { kind: 'respond', which: 'oldest' },
            { kind: 'toggle', target: 'reader' },
            { kind: 'input', value: 2 },
            { kind: 'input', value: 3 },
        ],
    ],
];

const ERROR_TEXT = 'Try again or contact the application owner.';

interface HeldRequest {
    release: () => void;
}

/** Give a consumer its own poll owner, as each DynamicComponent does in an app. */
function PollOwner({ children }: { children: JSX.Element }): JSX.Element {
    const pollScope = usePollScope();
    const variables = useRef<Set<string>>(new Set());
    return <VariableCtx.Provider value={{ pollScope, variables }}>{children}</VariableCtx.Provider>;
}

function ValueOf({
    testId,
    variable,
}: {
    testId: string;
    variable: SingleVariable<any> | DerivedVariable;
}): JSX.Element {
    const [value] = useVariable<string>(variable);
    return <span data-testid={testId}>{String(value)}</span>;
}

/**
 * Render a consumer the way a DynamicComponent does: an error boundary, then
 * the component's poll owner when it has one, then a Suspense boundary.
 */
function Guarded({ children, owned, testId }: { children: JSX.Element; owned: boolean; testId: string }): JSX.Element {
    const suspended = <Suspense fallback={<span data-testid={`${testId}-loading`}>loading</span>}>{children}</Suspense>;
    return (
        <ErrorBoundary fallbackRender={({ error }) => <span data-testid={`${testId}-error`}>{String(error)}</span>}>
            {owned ? <PollOwner>{suspended}</PollOwner> : suspended}
        </ErrorBoundary>
    );
}

let runIndex = 0;

async function runScenario(commands: Command[], pollingInterval: number | null): Promise<void> {
    runIndex++;
    clearRegistries_TEST();
    clearCaches_TEST();

    const dependency: Variable<number> = {
        __typename: 'Variable',
        default: 1,
        nested: [],
        uid: `model-input-${runIndex}`,
    };
    const derived: DerivedVariable = {
        __typename: 'DerivedVariable',
        deps: [dependency],
        nested: [],
        polling_interval: pollingInterval ?? undefined,
        uid: `model-derived-${runIndex}`,
        variables: [dependency],
    };
    // Reading this Variable reads the DerivedVariable without owning its request
    const withDerivedDefault: SingleVariable<any> = {
        __typename: 'Variable',
        default: derived,
        nested: [],
        uid: `model-reader-${runIndex}`,
    };
    const pythonName = `ModelComponent${runIndex}`;
    const python = {
        name: pythonName,
        props: {
            dynamic_kwargs: { value: dependency },
            polling_interval: pollingInterval,
            js_module: 'test',
            func_name: 'model',
        },
        uid: `model-python-${runIndex}`,
    } satisfies PyComponentInstance;

    const held: HeldRequest[] = [];
    let responseCount = 0;
    const hold = (signal: AbortSignal): Promise<void> =>
        new Promise<void>((resolve) => {
            if (signal.aborted) {
                resolve();
                return;
            }
            const entry: HeldRequest = { release: resolve };
            held.push(entry);
            signal.addEventListener(
                'abort',
                () => {
                    held.splice(held.indexOf(entry), 1);
                    resolve();
                },
                { once: true }
            );
        });
    const inputOf = (body: { values: { lookup: Record<string, number> } }): number =>
        Object.values(body.values.lookup)[0]!;

    server.use(
        http.post(`/api/core/derived-variable/${derived.uid}`, async ({ request }) => {
            const input = inputOf(await request.clone().json());
            await hold(request.signal);
            return HttpResponse.json({ cache_key: `${input}-${++responseCount}`, value: `dv-${input}` });
        }),
        http.post(`/api/core/components/${pythonName}`, async ({ request }) => {
            const input = inputOf(await request.clone().json());
            await hold(request.signal);
            return HttpResponse.json({ data: { name: 'RawString', props: { content: `py-${input}` } }, lookup: {} });
        })
    );

    const shown: Record<Target, boolean> = { owned: true, reader: false, python: false };
    let currentInput = 1;
    const controls: {
        setInput?: (value: number) => void;
        setShown?: (shown: Record<Target, boolean>) => void;
    } = {};

    function Host(): JSX.Element {
        const [visible, setVisible] = useState(shown);
        const [, setInput] = useVariable(dependency);
        controls.setInput = setInput;
        controls.setShown = setVisible;
        return (
            <>
                {visible.owned && (
                    <Guarded owned testId="owned">
                        <ValueOf testId="owned" variable={derived} />
                    </Guarded>
                )}
                {visible.reader && (
                    <Guarded owned={false} testId="reader">
                        <ValueOf testId="reader" variable={withDerivedDefault} />
                    </Guarded>
                )}
                {visible.python && (
                    <div data-testid="python">
                        <DynamicComponent component={python} />
                    </div>
                )}
            </>
        );
    }

    const rendered = render(<Host />, { wrapper: Wrapper });
    const flush = async (ms: number): Promise<void> => {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(ms);
        });
    };
    const assertNoErrors = (step: string): void => {
        for (const target of ['owned', 'reader'] as const) {
            const error = rendered.queryByTestId(`${target}-error`);
            if (error) {
                throw new Error(`${step}: ${target} shows an error: ${error.textContent}`);
            }
        }
        if (rendered.queryByText(ERROR_TEXT)) {
            throw new Error(`${step}: python component shows an error`);
        }
    };

    try {
        await flush(20);
        for (const [index, command] of commands.entries()) {
            switch (command.kind) {
                case 'toggle':
                    shown[command.target] = !shown[command.target];
                    act(() => controls.setShown!({ ...shown }));
                    break;
                case 'input':
                    currentInput = command.value;
                    act(() => controls.setInput!(command.value));
                    break;
                case 'respond': {
                    const answered =
                        command.which === 'all'
                            ? held.splice(0)
                            : [command.which === 'oldest' ? held.shift() : held.pop()];
                    answered.forEach((request) => request?.release());
                    break;
                }
                case 'tick':
                    await flush(command.ms);
                    break;
            }
            await flush(0);
            assertNoErrors(`after step ${index} (${JSON.stringify(command)})`);
        }

        // Answer everything until the system is quiet, then check every mounted consumer
        let quietRounds = 0;
        for (let round = 0; round < 40 && quietRounds < 2; round++) {
            held.splice(0).forEach((request) => request.release());
            await flush(150);
            quietRounds = held.length === 0 ? quietRounds + 1 : 0;
        }
        assertNoErrors('after settling');

        const expected: Record<Target, string> = {
            owned: `dv-${currentInput}`,
            python: `py-${currentInput}`,
            reader: `dv-${currentInput}`,
        };
        for (const target of ['owned', 'reader', 'python'] as const) {
            if (!shown[target]) {
                continue;
            }
            const actual = rendered.queryByTestId(target)?.textContent ?? '(nothing rendered)';
            if (actual !== expected[target]) {
                throw new Error(`after settling: ${target} shows "${actual}", expected "${expected[target]}"`);
            }
        }
    } finally {
        held.splice(0).forEach((request) => request.release());
        rendered.unmount();
        await flush(0);
        server.resetHandlers();
    }
}

describe('request ownership model', () => {
    beforeAll(() => {
        server.listen();
    });
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });
    afterAll(() => server.close());

    it('keeps a Variable with a DerivedVariable default on the value for the current input', async () => {
        await runScenario(
            [
                { kind: 'respond', which: 'oldest' },
                { kind: 'toggle', target: 'owned' },
                { kind: 'toggle', target: 'reader' },
                { kind: 'input', value: 2 },
                { kind: 'input', value: 3 },
            ],
            null
        );
    });

    it('serves a reader that does not own the request after its owner released it', async () => {
        await runScenario(
            [
                { kind: 'toggle', target: 'owned' },
                { kind: 'tick', ms: 0 },
                { kind: 'toggle', target: 'reader' },
            ],
            null
        );
    });

    it('never shows an error and settles on the value for the current input', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(commandArb, { maxLength: 14 }),
                fc.constantFrom<number | null>(null, 1),
                async (commands, pollingInterval) => runScenario(commands, pollingInterval)
            ),
            {
                examples: KNOWN_FAILURES.map(([, commands]): [Command[], number | null] => [commands, null]),
                numRuns: Number(process.env.DARA_MODEL_RUNS ?? 100),
            }
        );
    }, 120_000);
});
