import * as React from 'react';

/**
 * Hook to observe the visibility of a pane. Accepts a callback to call when the visibility changes,
 * and returns a function to check whether a given domRect is visible within the pane.
 *
 * @param pane - pane to observe visibility of
 * @param onVisibilityChange - callback to call when visibility changes
 */
export default function usePaneVisibility(
    pane: React.RefObject<HTMLElement>,
    onVisibilityChange: (isVisible: boolean) => void
): { isRectVisible: (domRect: DOMRect) => Promise<boolean> } {
    // Keep track of whether the graph pane is visible
    const isPaneVisible = React.useRef(false);

    React.useEffect(() => {
        if (!pane.current) {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                isPaneVisible.current = entry.isIntersecting;
                onVisibilityChange(isPaneVisible.current);
            }
        });

        observer.observe(pane.current);

        return () => {
            observer.disconnect();
        };
    }, [onVisibilityChange, pane]);

    /**
     * Check whether a given domRect is visible on screen, i.e. within a visible part of the pane
     *
     * @param domRect - dom rect to check visibility of
     * @returns whether the given domRect is visible within the pane
     */
    async function isRectVisible(domRect: DOMRect): Promise<boolean> {
        // pane is not visible at all (i.e. collapsed / scrolled out of view)
        if (!isPaneVisible.current) {
            return false;
        }

        // otherwise create a new one-off observer to check whether given domRect position is on screen
        // NOTE: we're relying on the fact that as per the IntersectionObserver spec, the callback is immediately invoked on observe
        let resolve: (entries: IntersectionObserverEntry | null) => void;
        const recordPromise = new Promise<IntersectionObserverEntry | null>((r) => {
            resolve = r;
        });
        const observer = new IntersectionObserver((entries) => {
            resolve(entries[0]);
        });
        observer.observe(pane.current);

        // create a timeout promise to race with to ensure the promise resolves in a reasonable time
        const timeoutPromise = new Promise<null>((r) => setTimeout(r, 500, null));

        const rec = await Promise.race([recordPromise, timeoutPromise]);

        // make sure to disconnect the observer
        observer.disconnect();

        // timeout occurred
        if (!rec) {
            return false;
        }

        // offscreen
        if (rec.intersectionRatio <= 0) {
            return false;
        }

        // fully on screen - assume visible
        if (rec.intersectionRatio === 1) {
            return true;
        }

        // otherwise, partially on screen
        // check if the domRect is within the intersectionRect
        // i.e. it's on a visible part of the pane
        return (
            rec.intersectionRect.top <= domRect.top &&
            rec.intersectionRect.bottom >= domRect.bottom &&
            rec.intersectionRect.left <= domRect.left &&
            rec.intersectionRect.right >= domRect.right
        );
    }

    return {
        isRectVisible,
    };
}
