import { type MouseEventHandler, useState } from 'react';

import styled from '@darajs/styled-components';

const ResizerWrapper = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;

    margin: 0;
    padding: 0;
`;

const ResizerDisplay = styled.div<{
    $hover: boolean;
}>`
    pointer-events: none;

    position: absolute;
    top: 0;
    right: -1px;
    bottom: 0;

    width: 4px;

    background-color: ${(props) => (props.$hover ? '#3F9BF8' : 'transparent')};

    transition: background-color 200ms ease;
`;

const ResizerGrabArea = styled.button`
    cursor: col-resize;
    resize: horizontal;

    /* This means the grab area will have 16px to the left of the sidebar and 8px on the right side */
    position: absolute;
    right: -8px;

    width: 24px;
    height: 100%;
    padding: 0;

    background-color: transparent;
    border: 0;
`;

interface ResizerProps {
    /**
     * Callback to execute when resizer is grabbed
     */
    onGrab: MouseEventHandler;

    /**
     * Current width of the sidebar
     */
    sidebarWidth: number;
}

/**
 * Sidebar resizer.
 * Displays a thin resizer bar with a larger grab area for easier resizing.
 */
export default function Resizer(props: ResizerProps): JSX.Element {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <ResizerWrapper style={{ right: props.sidebarWidth }}>
            <ResizerDisplay $hover={isHovered} />
            <ResizerGrabArea
                onMouseDown={props.onGrab}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            />
        </ResizerWrapper>
    );
}
