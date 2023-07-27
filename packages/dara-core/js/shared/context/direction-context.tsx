import { createContext } from 'react';

interface DirectionCtx {
    direction: 'column' | 'row';
}

const directionCtx = createContext<DirectionCtx>({ direction: 'row' });

export default directionCtx;
