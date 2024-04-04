/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef } from 'react';

import styled from '@darajs/styled-components';

import useMove from './use-move';

export const BUTTON_SIZE = 50;
const DRAG_OFFSET = BUTTON_SIZE / 2;

const FloatingDevtoolButton = styled.button<{
    $isDragging: boolean;
}>`
    cursor: ${(props) => (props.$isDragging ? 'grab' : 'pointer')};

    position: fixed;
    z-index: 10;

    display: inline-block;

    width: ${BUTTON_SIZE}px;
    height: ${BUTTON_SIZE}px;

    color: ${(props) => props.theme.colors.blue1};

    background-color: ${(props) => props.theme.colors.secondary};
    border: 1px solid;
    border-color: ${(props) => props.theme.colors.secondary};
    border-radius: 30%;

    transition-delay: 0s;
    transition-timing-function: ease;
    transition-duration: 150ms;
    transition-property: ${(props) => (!props.$isDragging ? 'left top' : 'none')};
`;

const ErrorBadge = styled.i`
    position: absolute;
    top: -0.8rem;
    right: -0.8rem;

    #badge-circle {
        color: ${(props) => props.theme.colors.error};
    }
`;

type Position = [number, number];

interface FloatingButtonProps {
    /**
     * Button state
     */
    buttonState: [Position, React.Dispatch<React.SetStateAction<Position>>];
    /**
     * Handler to invoke on button click
     */
    onClick: () => void;
    /**
     * Whether to show an error badge
     */
    showErrorBadge: boolean;
}

/**
 * Floating, draggable button.
 * Can display an error badge in top-right corner.
 */
export default function FloatingButton(props: FloatingButtonProps): JSX.Element {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [buttonPosition, setButtonPosition] = props.buttonState;
    const moveButton = useCallback((mouseMoveEvent: MouseEvent) => {
        // updates button position to mouse position
        // (- drag offset because we want the button's center to be where the mouse is, not it's top-left corner)
        setButtonPosition([mouseMoveEvent.clientX - DRAG_OFFSET, mouseMoveEvent.clientY - DRAG_OFFSET]);
    }, []);

    const { startMoving, isMoving: isButtonMoving } = useMove(moveButton);

    /**
     * Fix button position by moving it to it's correct position
     */
    function fixButtonPosition(): void {
        if (!buttonRef.current) {
            return;
        }

        const { x, y } = buttonRef.current.getBoundingClientRect();

        setButtonPosition((oldPos) => {
            let [newX, newY] = oldPos;

            // It's X position must be BUTTON_SIZE pixels from the left/right side of the window
            if (x < BUTTON_SIZE || x < window.innerWidth / 2) {
                newX = BUTTON_SIZE;
            } else if (x > window.innerWidth / 2 || window.innerWidth - x < BUTTON_SIZE * 2) {
                newX = window.innerWidth - BUTTON_SIZE * 2;
            }

            // It's Y position must be not be less than BUTTON_SIZE from top/bottom of the window
            if (y < BUTTON_SIZE) {
                newY = BUTTON_SIZE;
            } else if (window.innerHeight - y < BUTTON_SIZE * 2) {
                newY = window.innerHeight - BUTTON_SIZE * 2;
            }

            return [newX, newY];
        });
    }

    // Fix button position on window resize so it stays in bounds
    useEffect(() => {
        window.addEventListener('resize', fixButtonPosition);

        return () => {
            window.removeEventListener('resize', fixButtonPosition);
        };
    }, []);

    useEffect(() => {
        // Whenever button stops moving fix button position on next animation frame
        if (!isButtonMoving) {
            requestAnimationFrame(() => {
                fixButtonPosition();
            });
        }
    }, [isButtonMoving]);

    return (
        <FloatingDevtoolButton
            $isDragging={isButtonMoving}
            className="fa-stack"
            onClick={() => !isButtonMoving && props.onClick()}
            onMouseDown={startMoving}
            ref={buttonRef}
            style={{ left: `${buttonPosition[0]}px`, top: `${buttonPosition[1]}px` }}
        >
            {props.showErrorBadge && (
                <ErrorBadge className="fa-stack">
                    <i className="fa-stack-2x fa-solid fa-circle" id="badge-circle" />
                    <i className="fa-stack-1x fa-solid fa-triangle-exclamation" id="badge-triangle" />
                </ErrorBadge>
            )}
            <i className="fa-solid fa-bug fa-lg" />
        </FloatingDevtoolButton>
    );
}
