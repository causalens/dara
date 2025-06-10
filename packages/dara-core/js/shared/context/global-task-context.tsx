/* eslint-disable react-hooks/exhaustive-deps */
import * as React from 'react';
import { useRecoilCallback } from 'recoil';

import { cancelTask } from '@/api/core';
import { type RequestExtras } from '@/api/http';
import { type TriggerIndexValue, atomRegistry } from '@/shared/interactivity/store';
import { type GlobalTaskContext } from '@/types/core';

import { useRequestExtras } from './request-extras-context';

const GlobalTaskCtx = React.createContext<GlobalTaskContext | null>(null);

/**
 * Represents a task run
 */
export interface VariableTaskEntry {
    /** Task ID */
    taskId: string;
    /** Key of the trigger to increment in order to reset the associated selector */
    triggerKey?: string;
}

interface GlobalTaskProviderProps {
    children: JSX.Element;
    tasks?: Set<string>;
    variableTaskMap?: Map<string, Array<VariableTaskEntry>>;
}

export default function GlobalTaskProvider({ tasks, variableTaskMap, children }: GlobalTaskProviderProps): JSX.Element {
    /**
     * Set holding all currently running tasks
     */
    const tasksRef = React.useRef<Set<string>>(tasks ?? new Set());

    /**
     * Map of variableId -> Array(VariableTaskEntry)
     */
    const mapRef = React.useRef<Map<string, Array<VariableTaskEntry>>>(variableTaskMap ?? new Map());

    const extras = useRequestExtras();
    const extrasRef = React.useRef<RequestExtras>(extras);
    extrasRef.current = extras;

    const refreshSelector = useRecoilCallback(({ set }) => (key: string) => {
        // refresh the selector by incrementing the associated trigger so next run will skip the cache
        set(atomRegistry.get(key)!, (prev: TriggerIndexValue) => ({ ...prev, inc: prev.inc + 1 }));
    });

    const cleanupRunningTasks = React.useCallback((...variableIds: string[]): void => {
        for (const variableId of variableIds) {
            const taskEntries = mapRef.current.get(variableId);

            // check if any of the currently running tasks are associated with the variable
            for (const runningTask of tasksRef.current) {
                const taskToCancel = taskEntries?.find((t) => t.taskId === runningTask);

                // found a match
                if (taskToCancel) {
                    // cancel the task and mark it as stopped
                    cancelTask(runningTask, extrasRef.current);
                    tasksRef.current.delete(runningTask);

                    if (taskToCancel.triggerKey) {
                        // make sure next time the selector runs it will run from scratch rather than using the cached value
                        refreshSelector(taskToCancel.triggerKey);
                    }
                }
            }
        }
    }, []);

    const startTask = React.useCallback((taskId: string, variableId?: string, triggerKey?: string): void => {
        if (variableId) {
            // add the task to the variable -> tasks map
            const variableTaskEntries = mapRef.current.get(variableId) ?? [];
            variableTaskEntries.push({ taskId, triggerKey });
            mapRef.current.set(variableId, variableTaskEntries);
        }

        tasksRef.current.add(taskId);
    }, []);

    const endTask = React.useCallback((taskId: string): void => {
        tasksRef.current.delete(taskId);
    }, []);

    const getVariableTasks = React.useCallback((...variableIds: string[]): string[] => {
        let taskIds: string[] = [];

        for (const variable of variableIds) {
            const associatedTasks = mapRef.current.get(variable);

            // If there are associated tasks in the map
            if (associatedTasks) {
                // check which ones are currently running
                taskIds = associatedTasks
                    .filter((entry) => tasksRef.current.has(entry.taskId))
                    .map((entry) => entry.taskId);
            }
        }

        return taskIds;
    }, []);

    const hasRunningTasks = React.useCallback((): boolean => {
        return tasksRef.current.size > 0;
    }, []);

    const value = React.useMemo(
        () => ({
            cleanupRunningTasks,
            endTask,
            getVariableTasks,
            hasRunningTasks,
            startTask,
        }),
        [cleanupRunningTasks, endTask, getVariableTasks, hasRunningTasks, startTask]
    );

    return <GlobalTaskCtx.Provider value={value}>{children}</GlobalTaskCtx.Provider>;
}

export function useTaskContext(): GlobalTaskContext {
    const taskCtx = React.useContext(GlobalTaskCtx);

    if (!taskCtx) {
        throw new Error('useTaskContext must be used within GlobalTaskProvider');
    }

    return taskCtx;
}
