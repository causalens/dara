import { MutableRefObject, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import DefaultFallback from '@/components/fallback/default';
import ProgressTracker from '@/components/progress-tracker/progress-tracker';
import { FallbackCtx, ImportersCtx, VariableCtx, useTaskContext } from '@/shared/context';
import { ErrorDisplay, isSelectorError } from '@/shared/error-handling';
import { useRefreshSelector } from '@/shared/interactivity';
import useServerComponent, { useRefreshServerComponent } from '@/shared/interactivity/use-server-component';
import { hasTemplateMarkers, isJsComponent, useComponentRegistry, useInterval } from '@/shared/utils';
import {
    Component,
    ComponentInstance,
    DerivedDataVariable,
    DerivedVariable,
    isDerivedDataVariable,
    isDerivedVariable,
} from '@/types';
import { AnyVariable, isInvalidComponent, isRawString } from '@/types/core';

/**
 * Helper function to take a derived variable and get the lowest polling_interval of it and its chained derived
 * variables. It will recursively call itself to get the polling_interval of the chained derived variables.
 *
 * @param variable the derived variable to get the polling interval
 */
function getDerivedVariablePollingInterval(variable: DerivedVariable | DerivedDataVariable): number {
    let pollingInterval: number;

    if (variable.polling_interval) {
        pollingInterval = variable.polling_interval;
    }
    variable.variables.forEach((value) => {
        if (isDerivedVariable(value) || isDerivedDataVariable(value)) {
            const innerPollingInterval = getDerivedVariablePollingInterval(value);
            if (innerPollingInterval && (!pollingInterval || pollingInterval > innerPollingInterval)) {
                pollingInterval = innerPollingInterval;
            }
        }
    });
    return pollingInterval;
}

/**
 * Compute the polling interval for a component. This will take the polling_interval of the component and the
 * polling_interval of any derived variables in the component kwargs and return the lowest value.
 *
 * @param kwargs component kwargs
 * @param componentInterval component polling interval
 */
function computePollingInterval(kwargs: Record<string, AnyVariable<any>>, componentInterval?: number): number {
    let pollingInterval: number | undefined;

    Object.values(kwargs).forEach((value) => {
        if (isDerivedVariable(value) || isDerivedDataVariable(value)) {
            const innerPollingInterval = getDerivedVariablePollingInterval(value);
            if (innerPollingInterval && (!pollingInterval || pollingInterval > innerPollingInterval)) {
                pollingInterval = innerPollingInterval;
            }
        }
    });

    if (componentInterval && (!pollingInterval || pollingInterval > componentInterval)) {
        pollingInterval = componentInterval;
    }

    return pollingInterval;
}

/**
 * Resolve a component instance definition to an actual component to render
 *
 * @param component component instance definition
 * @param getComponentEntry callback to get component registry entry
 * @param importers importers registry
 */
async function resolveComponent(
    component: ComponentInstance,
    getComponentEntry: (instance: ComponentInstance) => Promise<Component>,
    importers: Record<string, () => Promise<any>>
): Promise<JSX.Element> {
    const componentEntry = await getComponentEntry(component);

    // It's a JS component - dynamically import the right component
    if (isJsComponent(componentEntry)) {
        const importer = importers[componentEntry.py_module];

        // Importer entry not present
        if (!importer) {
            // This error should only be seen by the app developer, so include details on how to solve it
            const errorDescription =
                componentEntry.py_module === 'LOCAL'
                    ? `This is a local component so make sure you are in production mode and dara.config.json is present.
                    You can try re-building JavaScript by running Dara with the --rebuild flag.`
                    : `This means that the JavaScript module for the component was not included by the discovery system.
                    You can try re-building JavaScript by running Dara with the --rebuild flag
                    and/or explicitly registering the component with "config.add_component(MyComponentClass)".`;
            return (
                <ErrorDisplay
                    config={{
                        description: `Importer for module "${componentEntry.py_module}" was not found. ${errorDescription}`,
                        title: `Component "${componentEntry.name}" could not be resolved`,
                    }}
                />
            );
        }

        let moduleContent = null;

        try {
            moduleContent = await importer();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
        }

        // Could not import module
        if (!moduleContent) {
            return (
                <ErrorDisplay
                    config={{
                        description: `Failed to import the JavaScript module for the component.
                            This likely means that the module was not installed properly.
                            You can try re-building JavaScript by running Dara with the --rebuild flag
                            and/or explicitly registering the component with "config.add_component(MyComponentClass)".`,
                        title: `Component "${componentEntry.name}" could not be resolved`,
                    }}
                />
            );
        }

        const ResolvedComponent = moduleContent[componentEntry.js_component ?? componentEntry.name];

        // Component does not exist in the module
        if (!ResolvedComponent) {
            return (
                <ErrorDisplay
                    config={{
                        description: `The JavaScript module was imported successfully but the component was not found within the module.`,
                        title: `Component "${componentEntry.name}" could not be resolved`,
                    }}
                />
            );
        }

        return <ResolvedComponent uid={component.uid} {...component.props} />;
    }

    // Otherwise it's a @py_component
    return (
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        <PythonWrapper
            dynamic_kwargs={component.props.dynamic_kwargs}
            func_name={component.props.func_name}
            name={component.name}
            polling_interval={component.props.polling_interval}
            uid={component.uid}
        />
    );
}

interface DynamicComponentProps {
    /** The component instance to inject */
    component: ComponentInstance;
}

/**
 * Get the fallback component for a given component instance
 *
 * @param fallback the fallback component instance
 * @param track_progress whether to track progress
 * @param variablesRef ref to set of variables to track
 * @param taskRef ref to task id of the running task
 */
function getFallbackComponent(
    fallback: ComponentInstance,
    track_progress: boolean,
    variablesRef: MutableRefObject<Set<string>>
): JSX.Element {
    let fallbackComponent = <DefaultFallback />;

    // user overrode the default fallback
    if (fallback) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        fallbackComponent = <DynamicComponent component={fallback} />;
    }

    if (track_progress) {
        return <ProgressTracker fallback={fallbackComponent} variablesRef={variablesRef} />;
    }

    return fallbackComponent;
}

/**
 * This component dynamically loads a component from the component registry. This component can either be another JS
 * component or it can be a python component defined in the backend. For JS components we use the importers context to
 * load the appropriate module and then extract the right component from that by its name. For python components we hand
 * off to the PythonWrapper component which makes the call to the backend to get the html string to inject into the DOM.
 *
 * @param props - the components props
 */
function DynamicComponent(props: DynamicComponentProps): JSX.Element {
    const [isLoading, setIsLoading] = useState(true);
    const [component, setComponent] = useState<JSX.Element>();
    const { get: getComponent } = useComponentRegistry();
    const importers = useContext(ImportersCtx);

    const firstRender = useRef(true);

    if (firstRender.current) {
        if (hasTemplateMarkers(props.component)) {
            throw new Error(
                `Component "${props.component.name}" has unhandled template markers. Make sure it's used in a component which handles templated components`
            );
        }

        firstRender.current = false;
    }

    useEffect(() => {
        if (props.component?.name === 'RawString') {
            setComponent(props.component.props.content);
            setIsLoading(false);
            return;
        }

        if (props.component) {
            resolveComponent(props.component, getComponent, importers).then((ResolvedComponent) => {
                setComponent(ResolvedComponent);
                setIsLoading(false);
            });
        }
    }, [props.component, getComponent]);

    const refreshSelector = useRefreshSelector();

    function onResetErrorBoundary(error: unknown): void {
        if (isSelectorError(error)) {
            refreshSelector(error.selectorId);
        }
    }

    const taskCtx = useTaskContext();
    const variables = useRef<Set<string>>(new Set());

    /*
        When this component unmounts, then cancel any pending tasks for this component. This is required because recoil uses
        React.Suspense which at the time of writing does not support cancellation
        This does not necessarily cancel the task, on the backend we keep track of number of subscribers,
        'cancelling' the task actually decrements the number of subs; the task is only cancelled once there are 0 subscribers left
    */
    useEffect(() => {
        return () => {
            // If there are running tasks and this component is subscribed to variables
            if (variables.current.size > 0 && taskCtx.hasRunningTasks()) {
                taskCtx.cleanupRunningTasks(...variables.current.values());
            }
        };
    }, []);

    const [fallback] = useState(() =>
        getFallbackComponent(props.component?.props?.fallback, props.component?.props?.track_progress, variables)
    );

    if (isLoading) {
        return null;
    }

    return (
        <ErrorBoundary
            fallbackRender={(fallbackProps) => (
                <ErrorDisplay config={props.component?.props?.error_handler} {...fallbackProps} />
            )}
            onReset={onResetErrorBoundary}
        >
            <FallbackCtx.Provider value={{ suspend: props.component?.props?.fallback?.props?.suspend_render ?? 200 }}>
                <VariableCtx.Provider value={{ variables }}>
                    <Suspense fallback={fallback}>{component}</Suspense>
                </VariableCtx.Provider>
            </FallbackCtx.Provider>
        </ErrorBoundary>
    );
}

interface PythonWrapperProps {
    /* Dynamic kwargs - variable definitions */
    dynamic_kwargs: {
        [k: string]: AnyVariable<any>;
    };
    /** Py_component function name - used for user-friendly display */
    func_name: string;
    /* Py_component name/uid - the same for all instances of the py_component */
    name: string;
    /* Polling interval to use for refetching the component */
    polling_interval: number;
    /* Component instance uid - unique for each instances */
    uid: string;
}

/**
 * This component handles rendering a server component. Utilises the
 * useServerComponent hook to make the call to the backend and then renders the returned component definition.
 *
 * Handles polling for the component if polling_interval is set in the component definition or in any of the
 * dynamic_kwargs (checked recursively).
 */
function PythonWrapper(props: PythonWrapperProps): JSX.Element {
    const component = useServerComponent(props.name, props.uid, props.dynamic_kwargs);
    const refresh = useRefreshServerComponent(props.uid);

    // Poll to update the component if polling_interval is set
    const pollingInterval = useMemo(
        () => computePollingInterval(props.dynamic_kwargs, props.polling_interval),
        [props.polling_interval]
    );
    useInterval(refresh, pollingInterval);

    if (component === null) {
        return null;
    }

    if (isRawString(component)) {
        let res = component.props.content
        if(res.startsWith('__dara__')){
            res = res.slice(8);
            const resJson = JSON.parse(res);
            console.log(resJson);
            return <DynamicComponent component={resJson} key={component.uid} />;
        }
        return <>{component.props.content}</>;
    }

    if (isInvalidComponent(component)) {
        return (
            <ErrorDisplay
                config={{
                    description: component.props.error,
                    title: `Component "${props.func_name}" returned an invalid component`,
                }}
                resetErrorBoundary={() => {
                    refresh();
                }}
            />
        );
    }

    return <DynamicComponent component={component} key={component.uid} />;
}

export default DynamicComponent;
