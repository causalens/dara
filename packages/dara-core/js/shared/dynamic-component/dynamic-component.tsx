import groupBy from 'lodash/groupBy';
import {
    type MutableRefObject,
    Suspense,
    memo,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import DefaultFallback from '@/components/fallback/default';
import { hasMarkers } from '@/components/for/templating';
import ProgressTracker from '@/components/progress-tracker';
import { FallbackCtx, VariableCtx, useTaskContext } from '@/shared/context';
import { ErrorDisplay, isSelectorError } from '@/shared/error-handling';
import { useRefreshSelector, useVariable } from '@/shared/interactivity';
import useServerComponent, { useRefreshServerComponent } from '@/shared/interactivity/use-server-component';
import { useInterval } from '@/shared/utils';
import {
    type ComponentInstance,
    type DerivedVariable,
    type JsComponent,
    type Variable,
    isDerivedVariable,
    isPyComponent,
} from '@/types';
import { type AnyVariable, type ModuleContent, UserError, isInvalidComponent, isRawString } from '@/types/core';

import { cleanProps } from './clean-props';

function computePollingInterval(
    resolvedKwargIntervals: Array<number | null>,
    componentInterval: number | null | undefined
): number | undefined {
    let pollingInterval: number | undefined;

    resolvedKwargIntervals.forEach((interval) => {
        if (typeof interval === 'number' && (!pollingInterval || pollingInterval > interval)) {
            pollingInterval = interval;
        }
    });

    if (typeof componentInterval === 'number' && (!pollingInterval || pollingInterval > componentInterval)) {
        pollingInterval = componentInterval;
    }

    return pollingInterval;
}

function collectDerivedPollingIntervals(
    variable: DerivedVariable,
    intervals: Array<Variable<number | null> | number | null>
): void {
    intervals.push(variable.polling_interval ?? null);

    variable.variables.forEach((value) => {
        if (isDerivedVariable(value)) {
            collectDerivedPollingIntervals(value, intervals);
        }
    });
}

/** py_module -> loaded module */
const MODULE_CACHE = new Map<string, ModuleContent>();
/** component.name -> metadata */
const COMPONENT_METADATA_CACHE = new Map<string, JsComponent>();

/**
 * Clear the caches for testing.
 * In prod we don't want to clear ever
 */
export function clearCaches_TEST(): void {
    MODULE_CACHE.clear();
    COMPONENT_METADATA_CACHE.clear();
}

/**
 * Load available components into the cache.
 *
 * @param importers - the importers object.
 * @param components - the components to register
 */
export async function preloadComponents(
    importers: Record<string, () => Promise<ModuleContent>>,
    jsComponents: JsComponent[]
): Promise<void> {
    const componentsByModule = groupBy(jsComponents, (component) => component.py_module);

    // load each module and pre-load the components
    for (const [pyModule, componentsInModule] of Object.entries(componentsByModule)) {
        let moduleContent: ModuleContent | null = null;

        // already cached
        if (MODULE_CACHE.has(pyModule)) {
            moduleContent = MODULE_CACHE.get(pyModule)!;
        } else {
            // Load module
            const importer = importers[pyModule];
            if (!importer) {
                throw new Error(`Missing importer for module ${pyModule}`);
            }

            try {
                // there will be at most a couple of modules, fine to do serially
                // eslint-disable-next-line no-await-in-loop
                moduleContent = await importer();
                if (moduleContent) {
                    MODULE_CACHE.set(pyModule, moduleContent);
                }
            } catch (e) {
                throw new Error(`Failed to load module ${pyModule}: ${String(e)}`);
            }
        }

        // pre-load components
        for (const component of componentsInModule) {
            if (COMPONENT_METADATA_CACHE.has(component.name)) {
                continue;
            }
            COMPONENT_METADATA_CACHE.set(component.name, component);
        }
    }
}

/**
 * Try resolving component synchronously from cache
 */
function resolveComponent(component: ComponentInstance | null | undefined): JSX.Element | null {
    if (!component) {
        return null;
    }

    if (component?.name === 'RawString') {
        return component.props.content;
    }

    const metadata = COMPONENT_METADATA_CACHE.get(component.name);

    // no cached metadata - must be a python component, we know we have to use the PythonWrapper
    if (!metadata) {
        // at this point validate this is a py_component, otherwise
        // this is some unregistered JS component
        if (!isPyComponent(component)) {
            return (
                <ErrorDisplay
                    config={{
                        title: `Component ${component.name} could not be resolved`,
                        description: `This likely means the component was not registered with the app.
                            You can try re-building JavaScript for the app by running Dara with the --rebuild flag and/or explicitly registering the component with "config.add_component(MyComponent)".
                            In most cases the import discovery system should auto-register components used throughout the app so please report the issue if you think it is a bug in the system.`,
                    }}
                />
            );
        }

        return (
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            <PythonWrapper
                component={component}
                dynamic_kwargs={component.props.dynamic_kwargs}
                func_name={component.props.func_name}
                name={component.name}
                polling_interval={component.props.polling_interval}
                uid={component.uid}
            />
        );
    }

    // JS component - check if module is loaded
    const moduleContent = MODULE_CACHE.get(metadata.py_module);

    // Somehow module wasn't loaded, show an error
    if (!moduleContent) {
        return (
            <ErrorDisplay
                config={{
                    title: `Component ${metadata.name} could not be resolved`,
                    description: `The JavaScript module for ${metadata.py_module} was not found`,
                }}
            />
        );
    }

    const ResolvedComponent = moduleContent[metadata.js_component ?? metadata.name] as React.ComponentType<any> | null;

    // Component does not exist in the module
    if (!ResolvedComponent) {
        return (
            <ErrorDisplay
                config={{
                    description: `The JavaScript module was imported successfully but the component was not found within the module.`,
                    title: `Component "${metadata.name}" could not be resolved`,
                }}
            />
        );
    }

    // assuming we returned a component, technically could be an action
    const props = cleanProps(component.props);
    return <ResolvedComponent uid={component.uid} {...props} />;
}

interface DynamicComponentProps {
    /** The component instance to inject */
    component: ComponentInstance | null | undefined;
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
    fallback: ComponentInstance | undefined,
    track_progress: boolean | undefined,
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
function DynamicComponent(props: DynamicComponentProps): React.ReactNode {
    const fallbackCtx = useContext(FallbackCtx);

    // Sanity check - LoopVariable should NEVER leak into the actual component, should be replaced
    // by the For component. Raise a user-visible error if it does as its a developer error.
    useLayoutEffect(() => {
        if (!props.component) {
            return;
        }
        const markerProp = hasMarkers(props.component);
        if (markerProp) {
            throw new UserError(
                `Component "${props.component.name}" has a loop variable in its "${markerProp}" property
                LoopVariable (aka "Variable.list_item") can only be used within the For component's "renderer" property.`
            );
        }
    }, [props.component]);

    // resolve component whenever it changes
    const component = useMemo(() => resolveComponent(props.component), [props.component]);

    const refreshSelector = useRefreshSelector();

    function onResetErrorBoundary(error: unknown): void {
        if (isSelectorError(error)) {
            refreshSelector(error.selectorId, error.selectorExtras);
        }
    }

    const { hasRunningTasks, cleanupRunningTasks } = useTaskContext();
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
            if (variables.current.size > 0 && hasRunningTasks()) {
                // eslint-disable-next-line react-hooks/exhaustive-deps
                cleanupRunningTasks(...variables.current.values());
            }
        };
    }, [cleanupRunningTasks, hasRunningTasks]);

    const [fallback] = useState(() =>
        getFallbackComponent(props.component?.props?.fallback, props.component?.props?.track_progress, variables)
    );

    // No component provided explicitly, return null
    if (!props.component) {
        return null;
    }

    // Compute the suspend setting for the component in order of precedence:
    // 1) explicit suspend_render setting on the component
    // 2) setting inherited from a parent component
    // 3) default value of 200ms
    const suspend = props.component?.props?.fallback?.props?.suspend_render ?? fallbackCtx?.suspend ?? 200;

    return (
        <ErrorBoundary
            fallbackRender={(fallbackProps) => (
                <ErrorDisplay config={props.component?.props?.error_handler} {...fallbackProps} />
            )}
            onReset={onResetErrorBoundary}
        >
            <FallbackCtx.Provider value={{ suspend }}>
                <VariableCtx.Provider value={{ variables }}>
                    <Suspense fallback={fallback}>{component}</Suspense>
                </VariableCtx.Provider>
            </FallbackCtx.Provider>
        </ErrorBoundary>
    );
}

interface PythonWrapperProps {
    component: ComponentInstance;
    /* Dynamic kwargs - variable definitions */
    dynamic_kwargs: {
        [k: string]: AnyVariable<any>;
    };
    /** Py_component function name - used for user-friendly display */
    func_name: string;
    /* Py_component name/uid - the same for all instances of the py_component */
    name: string;
    /* Polling interval to use for refetching the component */
    polling_interval: Variable<number | null> | number | null;
    /* Component instance uid - unique for each instances */
    uid: string;
}

function useResolveDynamicKwargPollingIntervals(
    dynamicKwargs: PythonWrapperProps['dynamic_kwargs']
): Array<number | null> {
    const derivedPollingIntervals = useMemo(() => {
        const intervals: Array<Variable<number | null> | number | null> = [];
        const orderedDynamicKwargKeys = Object.keys(dynamicKwargs).sort((left, right) => left.localeCompare(right));

        orderedDynamicKwargKeys.forEach((key) => {
            const value = dynamicKwargs[key];
            if (isDerivedVariable(value)) {
                collectDerivedPollingIntervals(value, intervals);
            }
        });

        return intervals;
    }, [dynamicKwargs]);

    return derivedPollingIntervals.map((interval) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const [resolvedInterval] = useVariable<number | null>(interval ?? null, { suspend: false });
        return resolvedInterval;
    });
}

/**
 * This component handles rendering a server component. Utilises the
 * useServerComponent hook to make the call to the backend and then renders the returned component definition.
 *
 * Handles polling for the component if polling_interval is set in the component definition or in any of the
 * dynamic_kwargs (checked recursively).
 */
function PythonWrapper(props: PythonWrapperProps): React.ReactNode {
    const component = useServerComponent(
        props.name,
        props.uid,
        props.dynamic_kwargs,
        props.component.loop_instance_uid
    );
    const refresh = useRefreshServerComponent(props.uid, props.component.loop_instance_uid);
    const [componentPollingInterval] = useVariable<number | null>(props.polling_interval ?? null);
    const resolvedKwargPollingIntervals = useResolveDynamicKwargPollingIntervals(props.dynamic_kwargs);

    // Poll to update the component if polling_interval is set
    const pollingInterval = useMemo(
        () => computePollingInterval(resolvedKwargPollingIntervals, componentPollingInterval),
        [resolvedKwargPollingIntervals, componentPollingInterval]
    );
    useInterval(refresh, pollingInterval);

    if (component === null) {
        return null;
    }

    if (isRawString(component)) {
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

export default memo(DynamicComponent);
