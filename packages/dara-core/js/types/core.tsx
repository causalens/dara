import { DefaultTheme } from '@darajs/styled-components';
import { NotificationPayload, useNotifications } from '@darajs/ui-notifications';
import { SortingRule } from '@darajs/ui-utils';
import { type History, type Location } from 'history';

import { CallbackInterface } from 'recoil';

import { WebSocketClientInterface } from '@/api/websocket';
import { GlobalTaskContext } from '@/shared/context/global-task-context';

export interface NormalizedPayload<T> {
    data: T;
    lookup: Record<string, any>;
}

export interface TaskResponse {
    task_id: string;
}

interface ConfigTheme {
    base?: 'dark' | 'light';
    main: 'dark' | 'light' | DefaultTheme;
}

export interface Config {
    application_name: string;
    context_components: Array<ComponentInstance<Record<never, any>>>;
    enable_devtools: boolean;
    live_reload: boolean;
    template: string;
    theme: ConfigTheme;
    title: string;
}

export type QueryCombinator = 'OR' | 'AND';

export interface ClauseQuery {
    clauses: FilterQuery[];
    combinator: QueryCombinator;
}

export type QueryOperator = 'EQ' | 'CONTAINS' | 'LT' | 'GT' | 'BT' | 'NE';

export interface ValueQuery {
    column: string;
    operator: QueryOperator;
    value: any;
}

export type FilterQuery = ClauseQuery | ValueQuery;

export interface Pagination {
    limit?: number;
    offset?: number;
    sort?: SortingRule;
    index?: number;
}

type CacheType = 'session' | 'global' | 'user';

interface CachePolicy {
    /**
     * Cache policy name. Frontend does not use this, but it is used by the backend to determine how to cache the variable.
     */
    policy: string;
    /**
     * Cache type name, i.e. whether to scope the cached results to the current session, user, or globally.
     */
    cache_type: CacheType;
}

export interface SingleVariable<T> {
    __typename: 'Variable';
    default: T;
    nested: string[];
    persist_value?: boolean;
    uid: string;
}

export interface UrlVariable<T> {
    __typename: 'UrlVariable';
    default: T;
    query: string;
    uid: string;
}

export interface DerivedVariable {
    __typename: 'DerivedVariable';
    cache?: null | CachePolicy;
    deps: Array<AnyVariable<any>>;
    nested: string[];
    polling_interval?: number;
    uid: string;
    variables: Array<AnyVariable<any>>;
}

export interface DerivedDataVariable {
    __typename: 'DerivedDataVariable';
    cache: CachePolicy;
    deps: Array<AnyVariable<any>>;
    filters: FilterQuery | null;
    polling_interval?: number;
    uid: string;
    variables: Array<AnyVariable<any>>;
}

export type DataFrame = Array<{
    [col: string]: any;
}>;

export interface DataVariable {
    __typename: 'DataVariable';
    cache: CachePolicy;
    filters: FilterQuery | null;
    uid: string;
}

export type AnyVariable<T> = SingleVariable<T> | UrlVariable<T> | DerivedVariable | DataVariable | DerivedDataVariable;
export type AnyDataVariable = DataVariable | DerivedDataVariable;
export type Variable<T> = SingleVariable<T> | UrlVariable<T> | DerivedVariable;

export interface ResolvedDerivedVariable {
    deps: Array<number>;
    type: 'derived';
    uid: string;
    values: Array<any>;
}

export interface ResolvedDataVariable {
    filters: FilterQuery | null;
    type: 'data';
    uid: string;
}

export interface ResolvedDerivedDataVariable {
    deps: Array<number>;
    filters: FilterQuery | null;
    type: 'derived-data';
    uid: string;
    values: Array<any>;
}

export enum ComponentType {
    JS = 'js',
    PY = 'py',
}

export interface JsComponent {
    js_component?: string;
    js_module: string;
    name: string;
    py_module: string;
    type: ComponentType.JS;
}

export interface PyComponent {
    name: string;
    type: ComponentType.PY;
}

export type Component = JsComponent | PyComponent;

export interface ErrorHandlingConfig {
    description: string;
    raw_css?: React.CSSProperties | string;
    title: string;
}

export interface BaseFallbackProps extends BaseComponentProps {
    suspend_render: boolean | number;
}

/**
 * Base props all components have
 */
export interface BaseComponentProps {
    [key: string]: any;
    error_handler?: ErrorHandlingConfig;
    fallback?: ComponentInstance<BaseFallbackProps>;
    raw_css?: React.CSSProperties | string;
    style?: React.CSSProperties;
    track_progress?: boolean;
}

/**
 * Base styling props
 */
export interface BaseStylingProps {
    /** How to align component, either itself or children within */
    align?: 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | 'match-parent';
    /** The background color of the element */
    background?: string;
    /** Apply strong emphasis to text */
    bold?: boolean;
    /** Apply a border around the element */
    border?: string;
    /** Set the radius of an element's corners */
    border_radius?: string;
    /** Component children */
    children?: any;
    /** Unique name of component */
    className?: string;
    /** Set the color of the text */
    color?: string;
    /** Category of component, for styling purposes */
    component_category?: string;
    /** Apply a different font family to the component */
    font?: string;
    /** Apply a different font size to the component */
    font_size?: string;
    /** Height of component, optional */
    height?: string;
    /** Apply weak emphasis to text */
    italic?: boolean;
    /** Apply a margin to the element */
    margin?: string;
    /** Apply a minimum width to the component */
    max_width?: string;
    /** Apply a maximum width to the component */
    min_width?: string;
    /** Apply padding to the element */
    padding?: string;
    /** Define the position of the element */
    position?: string;
    /** Whether to underline text */
    underline?: boolean;
    /** Width of component, optional */
    width?: string;
}

/**
 * Props of a component implementing the base styling props
 */
export type StyledComponentProps = BaseComponentProps & BaseStylingProps;

export interface ComponentInstance<Props = BaseComponentProps> {
    name: string;
    props: Props;
    templated?: boolean;
    uid: string;
}

export interface RawString extends ComponentInstance<{ content: string }> {
    name: 'RawString';
}

export function isRawString(instance: ComponentInstance): instance is RawString {
    return instance.name === 'RawString';
}

export interface InvalidComponent extends ComponentInstance<{ error: string }> {
    name: 'InvalidComponent';
}

export function isInvalidComponent(instance: ComponentInstance): instance is InvalidComponent {
    return instance.name === 'InvalidComponent';
}

export interface TemplatedComponentInstance {
    templated: true;
}

export interface TemplateMarker {
    __typename: 'TemplateMarker';
    field_name: string;
}

export interface RouteContent {
    content: ComponentInstance;
    name: string;
    /** Action to execute upon visiting the page */
    on_load: Action;
    route: string;
}

export interface RouteLink {
    icon?: string;
    name: string;
    route: string;
}

export interface Task {
    taskId: string;
    varUid: string;
}

export interface Template {
    layout: ComponentInstance;
    name: string;
}

export enum ConditionOperator {
    EQUAL = 'equal',
    GREATER_EQUAL = 'greater_equal',
    GREATER_THAN = 'greater_than',
    LESS_EQUAL = 'less_equal',
    LESS_THAN = 'less_than',
    NOT_EQUAL = 'not_equal',
    TRUTHY = 'truthy',
}

export interface Condition<T> {
    operator: ConditionOperator;
    other: any;
    variable: Variable<T>;
}

export interface ActionDef {
    /**
     * Action name
     */
    name: string;
    /**
     * Name of the JS module containing the action implementation
     */
    js_module: string;
    /**
     * Name of the Python module containing the action implementation
     */
    py_module: string;
}

export interface ActionImpl {
    /**
     * Name of the action implementation
     */
    name: string;
    /**
     * Marker to indicate this is an action implementation
     */
    __typename: 'ActionImpl';
}

export interface UpdateVariableImpl extends ActionImpl {
    variable: SingleVariable<any> | UrlVariable<any> | DataVariable;
    value: any;
}

export interface TriggerVariableImpl extends ActionImpl {
    variable: DerivedVariable;
    force: boolean;
}

export interface NavigateToImpl extends ActionImpl {
    url: string;
    new_tab: boolean;
}

export interface ResetVariablesImpl extends ActionImpl {
    variables: Array<AnyVariable<any>>;
}

export interface DownloadVariableImpl extends ActionImpl {
    variable: AnyVariable<any>;
    file_name?: string;
    type: 'csv' | 'json' | 'xlsx';
}

export type NotifyImpl = ActionImpl & NotificationPayload;

/**
 * Object injected into actions
 */
export interface ActionContext extends CallbackInterface {
    /**
     * Current auth session token
     */
    sessionToken: string;
    /**
     * Websocket Client instance
     */
    wsClient: WebSocketClientInterface;
    /**
     * History object
     */
    history: History;
    /**
     * Location object
     */
    location: Location;
    /**
     * Input value passed from the invoking component
     */
    input: any;
    /**
     * Task context
     */
    taskCtx: GlobalTaskContext;
    /**
     * Notification context
     */
    notificationCtx: ReturnType<typeof useNotifications>;
    /**
     * Callback invoked for any unhandled action
     *
     * @param action action impl object
     * @param actionContext action context object
     */
    onUnhandledAction?: ActionHandler;
}

/**
 * Signature of an ActionHandler
 */
export interface ActionHandler<ActionImplType extends ActionImpl = ActionImpl> {
    (actionContext: ActionContext, action: ActionImplType): void | Promise<void>;
}

/**
 * Serialized representation of an invoked @action-annotated function
 */
export interface AnnotatedAction {
    /***
     * Uid of the action instance - a specific usage of the annotated function
     */
    uid: string;
    /**
     * Uid of the action definition - a particular @action-annotated function
     */
    definition_uid: string;
    /**
     * Dynamic kwargs passed to the action
     */
    dynamic_kwargs: Record<string, AnyVariable<any>>;
}

export type Action = AnnotatedAction | ActionImpl | Array<AnnotatedAction | ActionImpl>;
