import * as React from 'react';

export interface VariableContext {
    /**
     * Set of variables subscribed to (with useVariable)
     */
    variables: React.MutableRefObject<Set<string>>;
}

const variablesCtx = React.createContext<VariableContext | null>(null);

export default variablesCtx;
