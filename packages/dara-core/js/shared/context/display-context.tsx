import { createContext } from 'react';

export interface DisplayCtxValue {
    /** Name of the component  */
    component: string | null;
    /**
     * Parent direction of content
     */
    direction: 'horizontal' | 'vertical';
    /** Whether component has hug property set and its children should inherit it */
    hug?: boolean;
}

const displayCtx = createContext<DisplayCtxValue>({ component: null, direction: 'horizontal' });

export default displayCtx;
