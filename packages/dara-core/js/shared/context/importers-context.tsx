import type { ModuleContent } from '@/types/core';
import { createContext } from 'react';

type ImportersCtx = {
    [k: string]: () => Promise<ModuleContent>;
};

const importersCtx = createContext<ImportersCtx>({});

export default importersCtx;
