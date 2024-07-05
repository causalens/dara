import { mix } from 'polished';
import * as React from 'react';

import styled from '@darajs/styled-components';
import { Button, Tooltip } from '@darajs/ui-components';
import { Xmark } from '@darajs/ui-icons';

import PointerContext from '@shared/pointer-context';

interface ZoomPromptProps {
    hasFocus: boolean;
    onClose: () => void;
    onDismiss: () => void;
}

const PromptWrapper = styled.div`
    display: flex;
    flex-shrink: 1;
    gap: 0.25rem;
    align-items: center;

    min-width: 0;
    padding: 0.25rem 0.5rem;

    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.primary};

    background-color: ${({ theme }) => mix(0.1, theme.colors.primary, theme.colors.blue1)};
    border: 1px solid ${({ theme }) => mix(0.5, theme.colors.primary, theme.colors.blue1)};
    border-radius: 4px;
`;

const DismissText = styled.span`
    overflow: hidden;
    min-width: 5ch;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const DismissButton = styled(Button)`
    height: auto;
    padding: 0.25rem;

    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.primary};

    background-color: transparent;

    &:hover:not(:disabled) {
        text-decoration: underline;
        background-color: transparent;
    }
`;

const DismissButtonText = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const CloseButton = styled(Button)`
    height: auto;
    padding: 0.25rem;
    color: ${({ theme }) => theme.colors.primary};

    &:hover:not(:disabled) {
        background-color: ${({ theme }) => mix(0.3, theme.colors.primary, theme.colors.blue1)};
    }
`;

const blurredText = 'To zoom in/out with scroll, click the viewer area.' as const;
const focusedText = 'To disable zoom in/out with scroll, click out of the viewer area.' as const;

export default function ZoomPrompt(props: ZoomPromptProps): React.ReactElement {
    const { disablePointerEvents, onPanelEnter, onPanelExit } = React.useContext(PointerContext);

    const [showTooltip, setShowTooltip] = React.useState(false);

    const textRef = React.useRef<HTMLSpanElement>(null);
    React.useEffect(() => {
        // use observer to detect text overflow
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // check if text is overflowing
                const isOverflowing = entry.target.scrollWidth > entry.target.clientWidth;
                setShowTooltip(isOverflowing);
            }
        });

        if (textRef.current) {
            observer.observe(textRef.current);
        }

        return () => {
            observer.disconnect();
        };
    }, [textRef]);

    const textContent = props.hasFocus ? focusedText : blurredText;

    return (
        <PromptWrapper
            onMouseEnter={onPanelEnter}
            onMouseLeave={onPanelExit}
            style={{
                pointerEvents: disablePointerEvents ? 'none' : 'all',
            }}
        >
            <CloseButton
                onClick={() => {
                    onPanelExit();
                    props.onClose();
                }}
                styling="ghost"
            >
                <Xmark size="lg" />
            </CloseButton>
            <Tooltip content={textContent} disabled={!showTooltip}>
                <DismissText ref={textRef}>{textContent}</DismissText>
            </Tooltip>
            <DismissButton
                onClick={() => {
                    onPanelExit();
                    props.onDismiss();
                }}
                styling="ghost"
            >
                <DismissButtonText>Don&apos;t show again</DismissButtonText>
            </DismissButton>
        </PromptWrapper>
    );
}
