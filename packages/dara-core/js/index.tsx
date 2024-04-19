import type { RequestExtras, RequestOptions } from './api';
import run from './run';
import type { RawCssProp } from './shared';
import type {
    Action,
    ActionDef,
    ActionHandler,
    ActionImpl,
    AnyDataVariable,
    AnyVariable,
    BaseComponentProps,
    BaseStylingProps,
    ClauseQuery,
    ComponentInstance,
    Condition,
    DataFrame,
    DataVariable,
    DerivedVariable,
    FilterQuery,
    LayoutComponentProps,
    Pagination,
    QueryOperator,
    SingleVariable,
    StyledComponentProps,
    Template,
    UrlVariable,
    ValueQuery,
    Variable,
} from './types';

// re-export things which have shared contexts, so UMD builds can access the share contexts
export * as ReactRouter from 'react-router-dom';
export * as Notifications from '@darajs/ui-notifications';

export type {
    Action,
    ActionHandler,
    ActionImpl,
    ActionDef,
    Condition,
    Template,
    Variable,
    ComponentInstance,
    SingleVariable,
    DerivedVariable,
    UrlVariable,
    DataVariable,
    DataFrame,
    FilterQuery,
    Pagination,
    ClauseQuery,
    QueryOperator,
    ValueQuery,
    AnyDataVariable,
    AnyVariable,
    BaseStylingProps,
    StyledComponentProps,
    BaseComponentProps,
    RequestExtras,
    RequestOptions,
    LayoutComponentProps,
};

export { UpdateVariable, TriggerVariable, NavigateTo, ResetVariables, DownloadVariable, Notify } from './actions';
export {
    useAuthCtx,
    useSessionToken,
    BasicAuthLogin,
    BasicAuthLogout,
    DefaultAuthLogin,
    revokeSession,
    verifySessionToken,
    handleAuthErrors,
    useUser,
} from './auth';
export { request } from './api';
export {
    DefaultFallback,
    RowFallback,
    Menu,
    RouterContent,
    SideBarFrame,
    TopBarFrame,
    ProgressTracker,
    For,
} from './components';
export {
    DynamicComponent,
    Center,
    useAction,
    useVariable,
    getIcon,
    useDataVariable,
    combineFilters,
    DisplayCtx,
    useComponentStyles,
    injectCss,
    useAnyVariable,
    resolveValue,
    useVariableValue,
    normalizeRequest,
    WebSocketCtx,
    DARA_JWT_TOKEN,
    getToken,
    getTokenKey,
    useRequestExtras,
    RequestExtrasProvider,
    PartialRequestExtrasProvider,
    useEventBus,
    EventBus,
    EventCapturer,
} from './shared';
export { ConditionOperator, isVariable } from './types';
export type { RawCssProp };
export { prependBaseUrl } from './utils';

// Add default export
export default run;
