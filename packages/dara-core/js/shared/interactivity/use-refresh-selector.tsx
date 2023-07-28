import { useRecoilCallback } from 'recoil';

import { selectorRegistry } from './store';

/**
 * Helper hook to refresh a selector by its key
 */
export default function useRefreshSelector(): (key: string) => void {
    return useRecoilCallback(({ refresh }) => {
        return (key: string) => {
            const selector = selectorRegistry.get(key);

            if (selector) {
                refresh(selector);
            }
        };
    });
}
