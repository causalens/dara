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
import ProgressTracker from '@/components/progress-tracker/progress-tracker';
import { FallbackCtx, ImportersCtx, VariableCtx, useTaskContext } from '@/shared/context';
import { ErrorDisplay, isSelectorError } from '@/shared/error-handling';
import { useRefreshSelector } from '@/shared/interactivity';
import useServerComponent, { useRefreshServerComponent } from '@/shared/interactivity/use-server-component';
import { isJsComponent, useComponentRegistry, useInterval } from '@/shared/utils';
import {
    type Component,
    type ComponentInstance,
    type DerivedDataVariable,
    type DerivedVariable,
    isDerivedDataVariable,
    isDerivedVariable,
} from '@/types';
import { type AnyVariable, type ModuleContent, UserError, isInvalidComponent, isRawString } from '@/types/core';

import { cleanProps } from './clean-props';

/**
 * Helper function to take a derived variable and get the lowest polling_interval of it and its chained derived
 * variables. It will recursively call itself to get the polling_interval of the chained derived variables.
 *
 * @param variable the derived variable to get the polling interval
 */
function getDerivedVariablePollingInterval(variable: DerivedVariable | DerivedDataVariable): number | undefined {
    let pollingInterval!: number;

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
function computePollingInterval(
    kwargs: Record<string, AnyVariable<any>>,
    componentInterval?: number
): number | undefined {
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

/** py_module -> loaded module */
const MODULE_CACHE = new Map<string, ModuleContent>();
/** component.name -> metadata */
const COMPONENT_METADATA_CACHE = new Map<string, Component>();

/**
 * Try resolving component synchronously from cache
 */
function resolveComponentSync(component: ComponentInstance): JSX.Element | null {
    if (component?.name === 'RawString') {
        return component.props.content;
    }

    const metadata = COMPONENT_METADATA_CACHE.get(component.name);

    if (!metadata) {
        return null; // no cached metadata
    }

    // we've cached information that this component is a python component, we know we have to use the PythonWrapper
    if (metadata.type === 'py') {
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

    if (!moduleContent) {
        return null; // Module not loaded yet
    }

    const ResolvedComponent = moduleContent[metadata.js_component ?? metadata.name];

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

    const props = cleanProps(component.props);
    return <ResolvedComponent uid={component.uid} {...props} />;
}

class ComponentLoadError extends Error {
    title: string;

    constructor(message: string, title: string) {
        super(message);
        this.title = title;
    }
}

/**
 * Resolve component asynchronously and populate caches
 */
async function resolveComponentAsync(
    component: ComponentInstance,
    getComponent: (component: ComponentInstance) => Promise<any>,
    importers: Record<string, () => Promise<ModuleContent>>
): Promise<void> {
    // Get component entry from registry
    const entry = await getComponent(component);

    if (!isJsComponent(entry)) {
        // Python component, just cache metadata and nothing else to do here
        COMPONENT_METADATA_CACHE.set(component.name, entry);
        return;
    }

    // JS component - cache metadata first
    COMPONENT_METADATA_CACHE.set(component.name, entry);

    // Check if module is already loaded
    if (MODULE_CACHE.has(entry.py_module)) {
        return; // Module already cached
    }

    // Load module if not cached
    const importer = importers[entry.py_module];
    if (!importer) {
        const errorDescription =
            entry.py_module === 'LOCAL' ?
                `This is a local component so make sure you are in production mode and dara.config.json is present.
                    You can try re-building JavaScript by running Dara with the --rebuild flag.`
            :   `This means that the JavaScript module for the component was not included by the discovery system.
                    You can try re-building JavaScript by running Dara with the --rebuild flag
                    and/or explicitly registering the component with "config.add_component(MyComponentClass)".`;

        throw new ComponentLoadError(errorDescription, `Component ${entry.name} could not be resolved`);
    }

    let moduleContent = null;
    try {
        moduleContent = await importer();
        if (moduleContent) {
            MODULE_CACHE.set(entry.py_module, moduleContent);
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Failed to load module ${entry.py_module}:`, e);
    }

    if (!moduleContent) {
        throw new ComponentLoadError(
            `Failed to import the JavaScript module for the component.
                            This likely means that the module was not installed properly.
                            You can try re-building JavaScript by running Dara with the --rebuild flag
                            and/or explicitly registering the component with "config.add_component(MyComponentClass)".`,
            `Component ${entry.name} could not be resolved`
        );
    }
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
    const importers = useContext(ImportersCtx);
    const fallbackCtx = useContext(FallbackCtx);
    const { get: getComponent } = useComponentRegistry();

    // Try sync resolution first
    const [component, setComponent] = useState<JSX.Element | null>(() => resolveComponentSync(props.component));
    const [isLoading, setIsLoading] = useState(() => component === null);
    const [loadingStarted, setLoadingStarted] = useState(false);

    // Sanity check - LoopVariable should NEVER leak into the actual component, should be replaced
    // by the For component. Raise a user-visible error if it does as its a developer error.
    useLayoutEffect(() => {
        const markerProp = hasMarkers(props.component);
        if (markerProp) {
            throw new UserError(
                `Component "${props.component.name}" has a loop variable in its "${markerProp}" property
                LoopVariable (aka "Variable.list_item") can only be used within the For component's "renderer" property.`
            );
        }
    }, [props.component]);

    // Async loading effect
    useEffect(() => {
        if (!isLoading || loadingStarted) {
            return;
        }

        setLoadingStarted(true);

        resolveComponentAsync(props.component, getComponent, importers)
            .then(() => {
                // Try sync resolution again after async loading
                const resolvedComponent = resolveComponentSync(props.component);
                setComponent(resolvedComponent);
                setIsLoading(false);
            })
            .catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Failed to resolve component:', error);
                setIsLoading(false);

                if (error instanceof ComponentLoadError) {
                    setComponent(<ErrorDisplay config={{ title: error.title, description: error.message }} />);
                }
            });
    }, [props.component, getComponent, importers, isLoading, loadingStarted]);

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

    if (isLoading) {
        return fallback;
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
function PythonWrapper(props: PythonWrapperProps): React.ReactNode {
    const component = useServerComponent(
        props.name,
        props.uid,
        props.dynamic_kwargs,
        props.component.loop_instance_uid
    );
    const refresh = useRefreshServerComponent(props.uid, props.component.loop_instance_uid);

    // Poll to update the component if polling_interval is set
    const pollingInterval = useMemo(
        () => computePollingInterval(props.dynamic_kwargs, props.polling_interval),
        [props.dynamic_kwargs, props.polling_interval]
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
