/* eslint-disable react-hooks/exhaustive-deps */
import { type MouseEventHandler, useCallback, useEffect, useRef, useState } from 'react';

type MoveHandler = (ev: MouseEvent) => void;

export interface UseMoveInterface {
    /**
     * Whether move is hapenning
     */
    isMoving: boolean;
    /**
     * Callback to call when a move is started.
     * Should be attached to a component's `onMouseDown` attribute.
     */
    startMoving: MouseEventHandler;
}

/**
 * Helper hook to support moving an element
 *
 * @param move move handler invoked whenever element is moved
 */
export default function useMove(move: MoveHandler): UseMoveInterface {
    const [isMoving, setIsMoving] = useState(false);
    const mouseDown = useRef(false);

    /**
     * On move invoke move handler if we're currently moving
     */
    const onMove = useCallback(
        (moveEvent: MouseEvent) => {
            if (isMoving) {
                move(moveEvent);
            }
        },
        [isMoving]
    );

    /**
     * Handler to be invoked when movement should start happening (i.e. on mousedown on a component)
     */
    const startMoving = useCallback(() => {
        mouseDown.current = true;

        setTimeout(() => {
            // Only start moving if mouse is still down after 100ms to allow clicking
            if (mouseDown.current) {
                setIsMoving(true);
            }
        }, 100);
    }, []);

    /**
     * Handler invoked on mouseup
     */
    const stopMoving = useCallback(() => {
        mouseDown.current = false;

        setTimeout(() => {
            // Only stop moving is mouse is still up
            if (!mouseDown.current) {
                setIsMoving(false);
            }
        }, 50);
    }, []);

    /**
     * Globally listen to mouse movements and mouseup events
     */
    useEffect(() => {
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', stopMoving);

        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', stopMoving);
        };
    }, [onMove, stopMoving]);

    return { isMoving, startMoving };
}
