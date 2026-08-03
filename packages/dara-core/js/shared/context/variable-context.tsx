import * as React from 'react';

import type { PollScope } from '@/shared/interactivity/polling';

export interface VariableContext {
    /**
     * Collects request keys before Suspense lets descendant effects commit.
     */
    pollScope?: PollScope;
    /**
     * Set of variables subscribed to (with useVariable)
     */
    variables: React.MutableRefObject<Set<string>>;
}

const variablesCtx = React.createContext<VariableContext | null>(null);

export default variablesCtx;
