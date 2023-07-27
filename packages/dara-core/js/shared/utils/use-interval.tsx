import { useEffect } from 'react';

import { useDeepCompare } from '@darajs/ui-utils';

/**
 * Helper hook that runs a function after given intervals
 *
 * @param callback the function to run after each interval
 * @param delay the delay in seconds between each interval
 */
function useInterval(callback: () => void, delay: number): void {
    useEffect(() => {
        if (delay) {
            const id = setInterval(callback, delay * 1000);
            return () => clearInterval(id);
        }
    }, useDeepCompare([delay, callback]));
}

export default useInterval;
