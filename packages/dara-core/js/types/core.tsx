import { DefaultTheme } from '@darajs/styled-components';
import { NotificationPayload } from '@darajs/ui-notifications';
import { SortingRule } from '@darajs/ui-utils';

import { WebSocketClientInterface } from '@/api/websocket';

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
    cache?: null | CacheType;
    deps: Array<AnyVariable<any>>;
    nested: string[];
    polling_interval?: number;
    uid: string;
    variables: Array<AnyVariable<any>>;
}

export interface DerivedDataVariable {
    __typename: 'DerivedDataVariable';
    cache: CacheType;
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
    cache: CacheType;
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
    /** Variables to reset upon visiting the page */
    reset_vars_on_load: Variable<any>[];
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
    js_module?: string;
    name: string;
    py_module: string;
}

export interface ActionInstance {
    name: string;
    uid: string;
}

export interface ActionBodyContext {
    extras?: NormalizedPayload<Record<string | number, any>>;
    inputs?: Record<string, any>;
}

export interface SideEffectInstance extends ActionInstance {
    block?: boolean;
    extras?: Array<Variable<any>>;
    name: 'SideEffect';
}
export interface NavigateToInstance extends ActionInstance {
    extras?: Array<Variable<any>>;
    name: 'NavigateTo';
    new_tab: boolean;
    url?: string;
}

export interface UpdateVariableInstance extends ActionInstance {
    extras?: Array<Variable<any>>;
    name: 'UpdateVariable';
    variable: Variable<any>;
}

export interface TriggerVariableInstance extends ActionInstance {
    force: boolean;
    name: 'TriggerVariable';
    variable: DerivedVariable | DerivedDataVariable;
}

export interface ResetVariablesInstance extends ActionInstance {
    name: 'ResetVariables';
    variables: Variable<any>[];
}

export interface DownloadVariableInstance extends ActionInstance {
    file_name?: string;
    name: 'DownloadVariable';
    type?: 'csv' | 'xlsx' | 'json';
    variable: AnyVariable<any>;
}

export interface DownloadContentInstance extends ActionInstance {
    extras?: Array<AnyVariable<any>>;
    name: 'DownloadContent';
}

export type NotifyInstance = ActionInstance & NotificationPayload;

export interface LogoutInstance extends ActionInstance {
    name: 'Logout';
}

/**
 * Object injected into actions
 */
export interface ActionContext<T> {
    /**
     * Helper function to execute an action on the server
     */
    fetchAction: (uid: string, body: ActionBodyContext) => Promise<T>;
    /**
     * Current auth session token
     */
    sessionToken: string;
    /**
     * Websocket Client instance
     */
    wsClient: WebSocketClientInterface;
}

/**
 * Signature of an ActionHook
 */
export interface ActionHook<ActionReturnType, ActionInstanceType extends ActionInstance = ActionInstance> {
    (action: ActionInstanceType, actionContext: ActionContext<ActionReturnType>): (value: any) => Promise<void>;
}

export type Action = ActionInstance | ActionInstance[];
