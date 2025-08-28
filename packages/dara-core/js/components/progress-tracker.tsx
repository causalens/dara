/* eslint-disable react-hooks/exhaustive-deps */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Subscription } from 'rxjs';

import styled from '@darajs/styled-components';
import { ProgressBar } from '@darajs/ui-components';

import { type ProgressNotificationMessage } from '@/api/websocket';
import { useTaskContext } from '@/shared/context/global-task-context';
import websocketCtx from '@/shared/context/websocket-context';
import { type GlobalTaskContext } from '@/types/core';

const POLLING_INTERVAL = 100;
const FAKE_PROGRESS_INTERVAL = 100;
const ESTIMATE_RATIO = 0.85;

/**
 * Progress estimator function - roughly `y = 1 - exp(x)`.
 *
 * @param time time in milliseconds
 * @param timeConstant seconds to reach 63%, then 86%, then 95%, then 98%
 */
function estimateProgress(time: number, timeConstant = 10): number {
    // This reaches in 63% in 10s, 86% in 20s
    return 1 - Math.exp((-1 * time) / (FAKE_PROGRESS_INTERVAL * 10 * timeConstant));
}

/**
 * Build a generator which will return fake progress
 *
 * @param progressStart starting point
 * @param progressEnd ending point
 * @param estimatedTime estimated time the faking should take; if specified, the fake progress
 *  will use 'real'/estimated values for 60% of the estimated time before changing to a fake algo
 */
function fakeProgressGenerator(
    progressStart: number,
    progressEnd: number,
    estimatedTime: number
): Generator<number, void, unknown> {
    const difference = progressEnd - progressStart;
    const estimatedProgressUpdates: number[] = [];
    let timeConstant = 10;

    // If estimated time is set, fake progress will start with estimated updates
    if (estimatedTime && estimatedTime !== 0) {
        const estimatedDifference = ESTIMATE_RATIO * difference;
        const estimatedProgressTime = ESTIMATE_RATIO * estimatedTime;
        const numberOfUpdates = estimatedProgressTime / FAKE_PROGRESS_INTERVAL;
        const estimatedProgressChunk = estimatedDifference / numberOfUpdates;

        let t = 0;
        let p = progressStart;

        // Compute list of 'estimated' (estimated) progress updates
        while (t < estimatedProgressTime) {
            p += estimatedProgressChunk;
            t += FAKE_PROGRESS_INTERVAL;
            estimatedProgressUpdates.push(p);
        }

        // Set time constant (time to reach 63% of the target) to the remaining chunk of estimated time
        timeConstant = (1 - ESTIMATE_RATIO) * (estimatedTime / 1000);
    }

    // Build internal generator which returns estimated updates, then fake updates
    function* getNextUpdate(): Generator<number, void, unknown> {
        let startFrom = progressStart;

        // First we return estimated updates
        while (estimatedProgressUpdates.length > 0) {
            const update = estimatedProgressUpdates.shift()!;
            startFrom = update;
            yield update;
        }

        let i = 0;

        // Then keep returning fake updates based on the estimate function
        while (true) {
            // Estimated is in range 0-1
            const estimated = estimateProgress(FAKE_PROGRESS_INTERVAL * i, timeConstant);

            // Rescale estimated to range of startFrom->progressEnd
            yield estimated * (progressEnd - startFrom) + startFrom;

            i++;
        }
    }

    return getNextUpdate();
}

const ProgressWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
`;

const ProgressHeader = styled.h4`
    font-size: 1.2rem;
`;

const ProgressMessage = styled.span`
    font-size: ${(props) => props.theme.font.size};
`;

/**
 * Retrieve a list of running tasks if there are any
 *
 * @param tasksContext
 * @param variablesRef
 */
function findRunningTasks(
    tasksContext: GlobalTaskContext,
    variablesRef?: React.MutableRefObject<Set<string>>
): string[] {
    // check if there are variables the component is subscribed to, and there are tasks running
    if (!(variablesRef && variablesRef?.current?.size > 0 && tasksContext.hasRunningTasks())) {
        return [];
    }

    return tasksContext.getVariableTasks(...variablesRef.current.values());
}

interface ProgressTrackerProps {
    /**
     * Fallback element to render when there is no task tracked
     */
    fallback?: JSX.Element;
    /**
     * Ref holding a list of variables the component is subscribed to
     */
    variablesRef?: React.MutableRefObject<Set<string>>;
}

/**
 * Represents current state of the progress
 */
interface Progress {
    message: string;
    progress: number;
}

/**
 * ProgressTracker component can be used as a placeholder to replace the standard loading spinner.
 * If a task is running, data is captured from the task function and a ProgressBar with live updates in shown.
 */
function ProgressTracker(props: ProgressTrackerProps): React.ReactNode {
    const taskContext = useTaskContext();
    const { client: wsClient } = useContext(websocketCtx);
    const [latestProgressUpdate, setLatestProgressUpdate] = useState<ProgressNotificationMessage['message'] | null>(
        null
    ); // latest progress message
    const [progress, setProgress] = useState<Progress | null>(null);
    const fakeInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const [subscribedTaskIds, setSubscribedTaskIds] = useState<string[]>([]);

    const [restartTrigger, setRestartTrigger] = useState(0); // used to trigger a restart of polling for a running task

    useEffect(() => {
        if (!wsClient) {
            return;
        }

        let progressSubscription: Subscription | null = null;

        // Start polling and looking for running tasks
        const timer = setInterval(() => {
            const taskIds = findRunningTasks(taskContext, props.variablesRef);

            // Once tasks are found, subscribe to their progress updates and stop polling
            // This handles a component having multiple tasks running - it's a limitation that only one of them
            // can be tracked; this is only an issue if a component calls useVariable for multiple inputs
            if (taskIds.length > 0) {
                setSubscribedTaskIds(taskIds);

                progressSubscription = wsClient.progressUpdates$(...taskIds).subscribe((notif) => {
                    setLatestProgressUpdate(notif.message);
                });

                clearInterval(timer);
            }
        }, POLLING_INTERVAL);

        return () => {
            // Clean up intervals and subscriptions
            clearInterval(timer);

            if (fakeInterval.current) {
                clearInterval(fakeInterval.current);
            }

            progressSubscription?.unsubscribe();
        };
    }, [restartTrigger, wsClient]);

    /**
     * Handle cancellations of subscribed task ids.
     */
    useEffect(() => {
        if (!wsClient) {
            return;
        }

        let subscription: Subscription | null = null;

        if (subscribedTaskIds.length > 0) {
            subscription = wsClient.taskStatusUpdates$(...subscribedTaskIds).subscribe((newStatus) => {
                if (newStatus === 'CANCELED') {
                    // Reset component
                    if (fakeInterval.current) {
                        clearInterval(fakeInterval.current);
                    }
                    setLatestProgressUpdate(null);
                    setSubscribedTaskIds([]);
                    setProgress(null);

                    // Restart polling
                    setRestartTrigger((v) => v + 1);
                }
            });
        }

        return () => {
            subscription?.unsubscribe();
        };
    }, [subscribedTaskIds, wsClient]);

    /**
     * Handle progress updates.
     * This is in a chained effect rather than in the subscription handler since it needs
     * access to the latest state.
     */
    useEffect(() => {
        if (!latestProgressUpdate) {
            return;
        }

        // Clear faking process interval if its set
        if (fakeInterval.current) {
            clearInterval(fakeInterval.current);
        }

        // whether we received a message to start fake mode
        const shouldStartFakeProgress = latestProgressUpdate.message.startsWith('FAKE_PROGRESS__');

        if (!shouldStartFakeProgress) {
            // If not, just update progress
            setProgress({
                message: latestProgressUpdate.message,
                progress: latestProgressUpdate.progress,
            });
            return;
        }

        // Start fake mode and update message to the sent message
        const [, estimatedTime, message] = latestProgressUpdate.message.split('__');
        setProgress({
            message: message!,
            progress: progress?.progress ?? 0,
        });

        const progressGenerator = fakeProgressGenerator(
            progress?.progress ?? 0,
            latestProgressUpdate.progress,
            parseFloat(estimatedTime!)
        );
        fakeInterval.current = setInterval(() => {
            const nextValue = progressGenerator.next().value as number;

            setProgress({
                message: message!,
                progress: nextValue,
            });
        }, FAKE_PROGRESS_INTERVAL);
    }, [latestProgressUpdate]);

    // If no task is running, just show a standard loading bar
    if (subscribedTaskIds.length === 0) {
        return props.fallback;
    }

    return (
        <ProgressWrapper>
            <ProgressHeader>Task in progress</ProgressHeader>
            {progress && (
                <>
                    <ProgressMessage>{progress.message}</ProgressMessage>
                    <ProgressBar progress={parseFloat(progress.progress.toFixed(2))} />
                </>
            )}
        </ProgressWrapper>
    );
}

export default ProgressTracker;
