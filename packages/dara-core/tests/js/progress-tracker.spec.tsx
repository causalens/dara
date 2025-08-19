/* eslint-disable no-loop-func */

/* eslint-disable jsx-a11y/control-has-associated-label */

/* eslint-disable react/button-has-type */

/* eslint-disable no-await-in-loop */
import { type RenderResult, act, fireEvent, render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useRef, useState } from 'react';
import { filter, take } from 'rxjs/operators';

import { ThemeProvider, theme } from '@darajs/styled-components';

import { clearRegistries_TEST } from '@/shared/interactivity/store';

import { TaskStatus } from '../../js/api/websocket';
import { DefaultFallback, ProgressTracker } from '../../js/components';
import { DynamicComponent, WebSocketCtx } from '../../js/shared';
import { GlobalTaskProvider, useTaskContext } from '../../js/shared/context';
import { Wrapper, server } from './utils';
import MockWebSocketClient from './utils/mock-web-socket-client';

const vuid = 'VUID';
const tuid = 'TASKID';

/**
 * Custom test harness for ProgressWrapper - renders progress tracker and buttons to control a mock websocket/task state
 */
const ProgressTrackerWrapper = (): JSX.Element => {
    const taskContext = useTaskContext();

    const variablesRef = useRef<Set<string>>(new Set());

    const [wsClient] = useState(new MockWebSocketClient('uid'));
    const [step, setStep] = useState(0);

    const [fakeUntil, setFakeUntil] = useState(100);

    return (
        <ThemeProvider theme={theme}>
            <button
                data-testid="start-button"
                onClick={() => {
                    variablesRef.current.add(vuid);
                    taskContext.startTask(tuid, vuid);
                }}
            />
            <button
                data-testid="progress-button"
                onClick={() => {
                    wsClient.receiveMessage({
                        message: {
                            message: `Step ${step}`,
                            progress: step * 25,
                            status: TaskStatus.PROGRESS,
                            task_id: tuid,
                        },
                        type: 'message',
                    });
                    setStep((s) => s + 1);
                }}
            />
            <button
                data-testid="cancel-button"
                onClick={() => {
                    // reset state
                    setStep(0);
                    taskContext.endTask(tuid);

                    // send cancellation message
                    wsClient.receiveMessage({
                        message: {
                            status: TaskStatus.CANCELED,
                            task_id: tuid,
                        },
                        type: 'message',
                    });
                }}
            />
            <input
                data-testid="fake-until"
                onChange={(e) => setFakeUntil(parseFloat(e.target.value))}
                value={fakeUntil}
            />
            <button
                data-testid="fake-button"
                onClick={() => {
                    wsClient.receiveMessage({
                        message: {
                            message: 'FAKE_PROGRESS__0__Faking progress',
                            progress: fakeUntil,
                            status: TaskStatus.PROGRESS,
                            task_id: tuid,
                        },
                        type: 'message',
                    });
                }}
            />
            <button
                data-testid="stop-fake-button"
                onClick={() => {
                    wsClient.receiveMessage({
                        message: {
                            message: `Step ${step}`,
                            progress: 99,
                            status: TaskStatus.PROGRESS,
                            task_id: tuid,
                        },
                        type: 'message',
                    });
                }}
            />
            <WebSocketCtx.Provider value={{ client: wsClient }}>
                <div data-testid="tracker">
                    <ProgressTracker fallback={<DefaultFallback />} variablesRef={variablesRef} />
                </div>
            </WebSocketCtx.Provider>
        </ThemeProvider>
    );
};

/**
 * Helper function to render a progress tracker and test its behaviour.
 *
 * @param testCallback callback to run on the rendered result
 */
function renderProgressTracker(ProgressWrapper: () => JSX.Element = ProgressTrackerWrapper): RenderResult {
    return render(<ProgressWrapper />, { wrapper: GlobalTaskProvider });
}

// NOTE: the tests throw some warnings which are due to the (slightly hacky) way the component is implemented
// to work around task being passed around as a ref and the use of `setInterval`

describe('ProgressTracker', () => {
    beforeEach(() => {
        server.listen();
        vi.useFakeTimers();
        clearRegistries_TEST();
    });

    afterEach(() => {
        server.resetHandlers();
        vi.clearAllTimers();
        vi.useRealTimers();
    });
    afterAll(() => server.close());

    it('should render a loading spinner if no task is running', async () => {
        const { getByTestId } = renderProgressTracker();
        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());
    });

    it('should show a progress bar if task is started', async () => {
        const { getByTestId, getByText } = renderProgressTracker();
        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());

        // Start task and send first progress update
        act(() => {
            const startButton = getByTestId('start-button');
            fireEvent.click(startButton);
            const progressButton = getByTestId('progress-button');
            fireEvent.click(progressButton);

            // Advance timers to trigger a check for task running
            vi.advanceTimersByTime(100);
        });

        await waitFor(() => expect(getByText('Task in progress')).toBeInTheDocument());
    });

    it('should track progress correctly', async () => {
        const { getByTestId, getByText } = renderProgressTracker();
        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());

        // Start task and send first progress update
        act(() => {
            vi.advanceTimersByTime(100);

            const startButton = getByTestId('start-button');
            fireEvent.click(startButton);
            const progressButton = getByTestId('progress-button');
            fireEvent.click(progressButton);

            // Advance timers to trigger a check for task running
            vi.advanceTimersByTime(100);
        });

        // Track progress
        for (let i = 1; i <= 4; i++) {
            act(() => {
                fireEvent.click(getByTestId('progress-button'));
            });
            await waitFor(() => expect(getByText(`Step ${i}`)).toBeInTheDocument());
        }
    });

    it('should fake progress from current progress until end', async () => {
        const { getByTestId, getByText } = renderProgressTracker();

        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());

        act(() => {
            vi.advanceTimersByTime(100);

            // Start task and send first progress update
            const startButton = getByTestId('start-button');
            fireEvent.click(startButton);
            const progressButton = getByTestId('progress-button');
            fireEvent.click(progressButton);

            // Advance timers to trigger a check for task running
            vi.advanceTimersByTime(100);
        });

        // Track progress for 2 steps
        for (let i = 1; i <= 2; i++) {
            act(() => {
                fireEvent.click(getByTestId('progress-button'));
            });

            await waitFor(() => expect(getByText(`Step ${i}`)).toBeInTheDocument());
        }

        // Fake progress till the end
        act(() => {
            const fakeButton = getByTestId('fake-button');
            fireEvent.click(fakeButton);
        });

        const getProgress = (): number => parseFloat(getByText(/%/).innerHTML.split('%')[0]);
        let currentProgress = getProgress();

        // Start from current progress - 50
        await waitFor(() => expect(currentProgress).toBe(50));
        await waitFor(() => expect(getByText('Faking progress')).toBeInTheDocument());

        // advance the timer a couple times to see it increasing automatically, without new messages coming in
        for (let i = 0; i < 5; i++) {
            act(() => {
                vi.advanceTimersByTime(100);
            });

            // Make sure it increases, i.e. it doesn't start over from 0
            await waitFor(() => {
                const newProgress = getProgress();
                expect(newProgress).toBeGreaterThan(currentProgress);
                currentProgress = newProgress;
            });
        }

        // Advance by a minute - it should evenually reach almost 100
        act(() => {
            vi.advanceTimersByTime(60000);
        });
        await waitFor(() => {
            expect(getProgress()).toBeGreaterThan(95);
            expect(getProgress()).toBeLessThan(100);
        });

        // Click stop fake button - should send an update with progress 99
        act(() => {
            const stopFakeButton = getByTestId('stop-fake-button');
            fireEvent.click(stopFakeButton);
        });
        await waitFor(() => expect(getProgress()).toBe(99));

        // Progress faking should stop - increasing timers further has no effect
        act(() => {
            vi.advanceTimersByTime(30000);
        });
        await waitFor(() => {
            expect(getProgress()).toBe(99);
        });
    });

    it('should fake progress until set number', async () => {
        const { getByTestId, getByText } = renderProgressTracker();

        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());

        act(() => {
            vi.advanceTimersByTime(100);

            // Start task and send first progress update
            const startButton = getByTestId('start-button');
            fireEvent.click(startButton);
            const progressButton = getByTestId('progress-button');
            fireEvent.click(progressButton);

            // Advance timers to trigger a check for task running
            vi.advanceTimersByTime(100);

            // Fake progress till 50
            const fakeInput = getByTestId('fake-until');
            fireEvent.input(fakeInput, { target: { value: 50 } });

            const fakeButton = getByTestId('fake-button');
            fireEvent.click(fakeButton);

            // Make sure faking process started
            vi.advanceTimersByTime(200);
        });

        await waitFor(() => expect(getByText('Faking progress')).toBeInTheDocument());

        const getProgress = (): number => parseFloat(getByText(/%/).innerHTML.split('%')[0]);
        let currentProgress = getProgress();

        // advance the timer a couple times to see it increasing automatically, without new messages coming in
        for (let i = 0; i < 5; i++) {
            act(() => {
                vi.advanceTimersByTime(100);
            });

            // Wait for progress to increase over 50
            await waitFor(() => {
                const newProgress = getProgress();
                expect(newProgress).toBeGreaterThan(currentProgress);
                currentProgress = newProgress;
            });
        }

        // Advance by 90s - it shouldn't increase above 50
        act(() => {
            vi.advanceTimersByTime(90000);
        });
        await waitFor(() => {
            expect(getProgress()).toBeGreaterThan(45);
            expect(getProgress()).toBeLessThanOrEqual(50);
        });

        // Click stop fake button - should send an update with progress 99
        act(() => {
            const stopFakeButton = getByTestId('stop-fake-button');
            fireEvent.click(stopFakeButton);
        });
        await waitFor(() => expect(getProgress()).toBe(99));

        // Progress faking should stop - increasing timers further has no effect
        act(() => {
            vi.advanceTimersByTime(30000);
        });
        await waitFor(() => {
            expect(getProgress()).toBe(99);
        });
    });

    it('should fake progress multiple times', async () => {
        const { getByTestId, getByText } = renderProgressTracker();
        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());

        act(() => {
            vi.advanceTimersByTime(100);

            // Start task and send first progress update
            const startButton = getByTestId('start-button');
            fireEvent.click(startButton);
            const progressButton = getByTestId('progress-button');
            fireEvent.click(progressButton);

            // Advance timers to trigger a check for task running
            vi.advanceTimersByTime(100);

            // Fake progress till 50
            const fakeInput = getByTestId('fake-until');
            fireEvent.input(fakeInput, { target: { value: 50 } });

            const fakeButton = getByTestId('fake-button');
            fireEvent.click(fakeButton);

            // Make sure faking process started
            vi.advanceTimersByTime(200);
        });

        await waitFor(() => expect(getByText('Faking progress')).toBeInTheDocument());

        const getProgress = (): number => parseFloat(getByText(/%/).innerHTML.split('%')[0]);
        let currentProgress = getProgress();

        // advance the timer a couple times to see it increasing automatically, without new messages coming in
        for (let i = 0; i < 5; i++) {
            act(() => {
                vi.advanceTimersByTime(100);
            });

            // Wait for progress to increase over 50
            await waitFor(() => {
                const newProgress = getProgress();
                expect(newProgress).toBeGreaterThan(currentProgress);
                currentProgress = newProgress;
            });
        }

        // Advance by 90s - it shouldn't increase above 50
        act(() => {
            vi.advanceTimersByTime(90000);
        });
        await waitFor(() => {
            expect(getProgress()).toBeGreaterThan(45);
            expect(getProgress()).toBeLessThanOrEqual(50);
        });

        // Fake until 90
        act(() => {
            const fakeInput = getByTestId('fake-until');
            const fakeButton = getByTestId('fake-button');

            fireEvent.input(fakeInput, { target: { value: 90 } });
            fireEvent.click(fakeButton);
        });

        currentProgress = getProgress();

        // advance the timer a couple times to see it increasing automatically, without new messages coming in
        for (let i = 0; i < 5; i++) {
            act(() => {
                vi.advanceTimersByTime(100);
            });

            // Wait for progress to increase
            await waitFor(() => {
                const newProgress = getProgress();
                expect(newProgress).toBeGreaterThan(currentProgress);
                currentProgress = newProgress;
            });
        }

        // Advance by 90s - it shouldn't increase above 90
        act(() => {
            vi.advanceTimersByTime(90000);
        });
        await waitFor(() => {
            expect(getProgress()).toBeGreaterThan(85);
            expect(getProgress()).toBeLessThanOrEqual(90);
        });

        // Click stop fake button - should send an update with progress 99
        act(() => {
            const stopFakeButton = getByTestId('stop-fake-button');
            fireEvent.click(stopFakeButton);
        });
        await waitFor(() => expect(getProgress()).toBe(99));

        // Progress faking should stop - increasing timers further has no effect
        act(() => {
            vi.advanceTimersByTime(30000);
        });
        await waitFor(() => {
            expect(getProgress()).toBe(99);
        });
    });

    it('should handle task being cancelled and restarted correctly', async () => {
        const { getByTestId, getByText } = renderProgressTracker();

        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());

        act(() => {
            vi.advanceTimersByTime(100);

            // Start task and send first progress update
            const startButton = getByTestId('start-button');
            fireEvent.click(startButton);
            const progressButton = getByTestId('progress-button');
            fireEvent.click(progressButton);

            // Advance timers to trigger a check for task running
            vi.advanceTimersByTime(100);
        });

        // Track progress 2 times
        for (let i = 1; i <= 2; i++) {
            act(() => {
                const progressButton = getByTestId('progress-button');
                fireEvent.click(progressButton);
            });
            await waitFor(() => expect(getByText(`Step ${i}`)).toBeInTheDocument());
        }

        // Press cancel button
        act(() => {
            const cancelButton = getByTestId('cancel-button');
            fireEvent.click(cancelButton);
        });

        // progress tracker should be a spinner again
        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());

        // start task over again
        act(() => {
            const startButton = getByTestId('start-button');
            const progressButton = getByTestId('progress-button');

            fireEvent.click(startButton);
            fireEvent.click(progressButton);

            // Advance timers to trigger a check for task running
            vi.advanceTimersByTime(100);
        });

        // Track progress
        for (let i = 1; i <= 4; i++) {
            act(() => {
                const progressButton = getByTestId('progress-button');
                fireEvent.click(progressButton);
            });
            await waitFor(() => expect(getByText(`Step ${i}`)).toBeInTheDocument());
        }
    });

    it('should render ProgressTracker for PY component with track_progress=True', async () => {
        const client = new MockWebSocketClient('uid');

        // override the mock implementations to be more realistic
        client.waitForTask = function waitForTask(this: MockWebSocketClient, taskId: string) {
            return this.messages$
                .pipe(
                    filter((msg: any) => taskId === msg.message.task_id),
                    take(1)
                )
                .toPromise();
        };
        client.progressUpdates$ = function progressUpdates$(this: MockWebSocketClient, ...task_ids: string[]) {
            return this.messages$.pipe(
                filter(
                    (msg: any) => task_ids.includes(msg.message.task_id) && msg.message.status === TaskStatus.PROGRESS
                )
            );
        };

        server.use(
            http.post('/api/core/components/:componentId', () => {
                return HttpResponse.json({
                    task_id: tuid,
                });
            })
        );

        server.use(
            http.get('/api/core/tasks/:taskId', () => {
                return HttpResponse.json({
                    data: {
                        name: 'RawString',
                        props: {
                            content: 'success',
                        },
                        uid: vuid,
                    },
                    lookup: {},
                });
            })
        );

        const { getByTestId, getByText } = render(
            <Wrapper client={client}>
                <DynamicComponent
                    component={{
                        name: 'TestComponent2',
                        props: {
                            dynamic_kwargs: {
                                test: {
                                    __typename: 'Variable',
                                    default: 'test',
                                    uid: 'var-id',
                                },
                            },
                            track_progress: true,
                        },
                        uid: vuid,
                    }}
                />
            </Wrapper>
        );
        await waitFor(() => expect(getByTestId('LOADING')).toBeInTheDocument());
        await waitFor(() => expect(getByText('Task in progress')).toBeInTheDocument());

        act(() => {
            client.receiveMessage({
                message: {
                    status: TaskStatus.COMPLETE,
                    task_id: tuid,
                },
                type: 'message',
            });
        });

        await waitFor(() => expect(getByText('success')).toBeInTheDocument());
    });
});
