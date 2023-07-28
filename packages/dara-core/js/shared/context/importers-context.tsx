import { createContext } from 'react';

type ImportersCtx = {
    [k: string]: () => Promise<any>;
};

const importersCtx = createContext<ImportersCtx>({});

export default importersCtx;
