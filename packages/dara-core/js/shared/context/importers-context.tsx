import { createContext } from 'react';

import type { ModuleContent } from '@/types/core';

type ImportersCtx = {
    [k: string]: () => Promise<ModuleContent>;
};

const importersCtx = createContext<ImportersCtx>({});

export default importersCtx;
