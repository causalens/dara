import * as React from 'react';
import { GetReferenceClientRect } from 'tippy.js';

import usePaneVisibility from './use-pane-visibility';

/**
 * Helper hook to manage a tooltip for the graph pane
 *
 * Handles showing and hiding the tooltip based on the visibility of the pane
 *
 * @param pane - pane to observe visibility of
 * @param tooltipRef - ref to the tooltip position
 */
export default function useGraphTooltip(
    pane: React.RefObject<HTMLElement>,
    tooltipRef: React.MutableRefObject<GetReferenceClientRect>
): {
    setTooltipContent: (content: React.ReactNode) => void;
    tooltipContent: React.ReactNode;
} {
    const [tooltipContent, setTooltipContent] = React.useState<React.ReactNode>(null);

    // force tooltip to hide when the pane becomes invisible
    const onPaneVisibilityChange = React.useCallback((isVisible: boolean) => {
        if (!isVisible) {
            setTooltipContent(null);
        }
    }, []);

    // reset tooltip when the pane becomes invisible
    React.useEffect(() => {
        const handler = (): void => {
            if (document.visibilityState !== 'visible') {
                setTooltipContent(null);
            }
        };

        document.addEventListener('visibilitychange', handler);

        return () => {
            document.removeEventListener('visibilitychange', handler);
        };
    }, []);

    // Keep track of whether the graph pane is visible
    const { isRectVisible } = usePaneVisibility(pane, onPaneVisibilityChange);

    /**
     * Show a tooltip at the current mouse position
     *
     * Makes sure the tooltip is only shown when the pane is visible
     *
     * @param content the content to show in the tooltip
     */
    function showTooltip(content: React.ReactNode): void {
        // if simply setting the content to null, don't bother with the visibility check
        if (!content) {
            setTooltipContent(null);
            return;
        }

        if (content === tooltipContent) {
            return;
        }

        // NOTE: This is technically async but will resolve immediately as it's resolved
        // in response to IntersectionObserver callback, which is guaranteed to fire
        // the next render cycle
        isRectVisible(tooltipRef.current()).then((isVisible) => {
            setTooltipContent(isVisible ? content : null);
        });
    }

    return {
        setTooltipContent: showTooltip,
        tooltipContent,
    };
}
