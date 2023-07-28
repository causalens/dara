import { BackendErrorsProvider } from './backend-errors';

/**
 * Context responsible for gathering data necessary for the devtools
 */
export default function DevtoolsContext(props: { children: JSX.Element }): JSX.Element {
    return <BackendErrorsProvider>{props.children}</BackendErrorsProvider>;
}
