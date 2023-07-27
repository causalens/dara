import DevtoolsContext from './devtools-context';
import DevToolsWrapper from './devtools-wrapper';

/**
 * Display devtools
 */
export default function DevTools(): JSX.Element {
    return (
        <DevtoolsContext>
            <DevToolsWrapper />
        </DevtoolsContext>
    );
}
