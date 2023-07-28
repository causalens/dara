import { useCallback, useRef, useState } from 'react';

import styled from '@darajs/styled-components';

import { useBackendErrors } from './backend-errors';
import DevToolsContent from './devtools-content';
import FloatingButton, { BUTTON_SIZE } from './floating-button';
import Resizer from './resizer';
import useMove from './use-move';

const MIN_WIDTH = 350;
const MAX_WIDTH = 600;

/**
 * Fit a given width value between the sidebar bounds
 *
 * @param width to fit in bounds
 */
function fitInBounds(width: number): number {
    if (width > MAX_WIDTH) {
        return MAX_WIDTH;
    }

    if (width < MIN_WIDTH) {
        return MIN_WIDTH;
    }

    return width;
}

const SidebarWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-grow: 0;
    flex-shrink: 0;

    min-width: ${MIN_WIDTH}px;
    max-width: ${MAX_WIDTH}px;
    height: 100%;

    box-shadow: 8px 2px 32px -2px rgba(0, 0, 0, 0.25);
`;

/**
 * DevTools parent display component.
 * Displays an absolutely-positioned floating button to toggle the view of the devtools sidebar,
 * and a sidebar with the devtools content.
 */
function DevToolsWrapper(): JSX.Element {
    const [showDevtools, setShowDevtools] = useState(false);

    const { errors } = useBackendErrors();

    const sidebarRef = useRef(null);
    const [sidebarWidth, setSidebarWidth] = useState(MIN_WIDTH);

    // invoked on resizer move
    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        setSidebarWidth(fitInBounds(sidebarRef.current.getBoundingClientRect().right - mouseMoveEvent.clientX));
    }, []);

    const { startMoving: startResizing } = useMove(resize);

    // Button state lifted out of button component so the position doesn't reset when opening/closing sidebar
    const buttonState = useState<[number, number]>([
        window.innerWidth - BUTTON_SIZE * 2,
        window.innerHeight - BUTTON_SIZE * 2,
    ]);

    // If not showing devtools, don't include the sidebar in the dom at all
    if (!showDevtools) {
        return (
            <FloatingButton
                buttonState={buttonState}
                onClick={() => setShowDevtools(true)}
                showErrorBadge={errors.length > 0}
            />
        );
    }

    return (
        <SidebarWrapper ref={sidebarRef} style={{ width: sidebarWidth }}>
            <Resizer onGrab={startResizing} sidebarWidth={sidebarWidth} />
            <DevToolsContent onCloseDevtools={() => setShowDevtools(false)} style={{ width: sidebarWidth }} />
        </SidebarWrapper>
    );
}

export default DevToolsWrapper;
