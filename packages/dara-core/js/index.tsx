import run from './run';
import type { RawCssProp } from './shared';
import type {
    Action,
    ActionDef,
    ActionHandler,
    ActionInstance,
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
    ActionInstance,
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
};

export {
    // useActionContext,
    UpdateVariable,
    TriggerVariable,
    // SideEffect,
    // NavigateTo,
    // ResetVariables,
    // DownloadVariable,
    // DownloadContent,
    // Notify,
    // Logout,
} from './actions';
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
} from './shared';
export { ConditionOperator, isVariable } from './types';
export type { RawCssProp };
export { prependBaseUrl } from './utils';

// Add default export
export default run;
