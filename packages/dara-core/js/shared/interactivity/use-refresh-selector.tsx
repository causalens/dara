import { useRecoilCallback } from 'recoil';

import { selectorFamilyMembersRegistry, selectorFamilyRegistry } from './store';

/**
 * Helper hook to refresh a selector by its key
 */
export default function useRefreshSelector(): (key: string, extras: string) => void {
    return useRecoilCallback(({ refresh }) => {
        return (key: string, extras: string) => {
            const family = selectorFamilyRegistry.get(key);

            if (family) {
                const selector = selectorFamilyMembersRegistry.get(family)?.get(extras);

                if (selector) {
                    refresh(selector);
                }
            }
        };
    });
}
